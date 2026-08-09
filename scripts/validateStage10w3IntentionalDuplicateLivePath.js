'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { pool } = require('../models/db');
const unitRequestModel = require('../models/unitRequestModel');
const unifiedRequestQueue = require('../services/unifiedRequestQueue');

const FEEDBACK_TEMPLATE = path.join(__dirname, '..', 'views', 'fragments', 'tech-unit-intentional-duplicate-request-feedback.ejs');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function selectLiveFixture() {
  const [rows] = await pool.query(
    `
      SELECT
        tech_user.user_id AS requested_by_user_id,
        matched_unit.unit_id AS matched_unit_id,
        destination_lot.lot_id AS requested_destination_lot_id
      FROM (
        SELECT DISTINCT u.user_id
        FROM users u
        INNER JOIN user_roles ur
          ON ur.user_id = u.user_id
        INNER JOIN roles r
          ON r.role_id = ur.role_id
        WHERE r.code = 'tech'
          AND COALESCE(u.is_active, 1) = 1
        ORDER BY u.user_id
        LIMIT 1
      ) tech_user
      CROSS JOIN (
        SELECT unit_id
        FROM units
        ORDER BY unit_id DESC
        LIMIT 1
      ) matched_unit
      CROSS JOIN (
        SELECT lot_id
        FROM lots
        ORDER BY lot_id
        LIMIT 1
      ) destination_lot
      WHERE NOT EXISTS (
        SELECT 1
        FROM unit_requests ur
        INNER JOIN unit_duplicate_requests udr
          ON udr.unit_request_id = ur.unit_request_id
        WHERE ur.request_type = 'intentional_duplicate'
          AND ur.status = 'pending'
          AND ur.requested_by_user_id = tech_user.user_id
          AND udr.matched_unit_id = matched_unit.unit_id
          AND udr.requested_destination_lot_id = destination_lot.lot_id
      )
      LIMIT 1
    `
  );

  return rows[0] || null;
}

async function cleanupRequest(unitRequestId) {
  if (!unitRequestId) return;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM unit_request_events WHERE unit_request_id = ?', [unitRequestId]);
    await connection.query('DELETE FROM unit_duplicate_requests WHERE unit_request_id = ?', [unitRequestId]);
    await connection.query('DELETE FROM unit_requests WHERE unit_request_id = ?', [unitRequestId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  let createdRequestId = null;

  try {
    const feedbackSource = fs.readFileSync(FEEDBACK_TEMPLATE, 'utf8');
    const feedbackHtml = ejs.render(feedbackSource, {
      errorMessages: ['Stage 10W.3 readiness feedback verification.']
    }, {
      filename: FEEDBACK_TEMPLATE
    });

    assert(feedbackHtml.includes('Stage 10W.3 readiness feedback verification.'), 'The Intentional Duplicate readiness feedback fragment did not render its error message.');

    const fixture = await selectLiveFixture();
    assert(fixture, 'A live-path fixture could not be selected. At least one active regular Tech, Unit, and Lot are required.');

    const marker = `Stage 10W.3 live path ${Date.now()}`;
    const createResult = await unitRequestModel.createIntentionalDuplicateRequest({
      requestedByUserId: Number(fixture.requested_by_user_id),
      matchedUnitId: Number(fixture.matched_unit_id),
      requestedDestinationLotId: Number(fixture.requested_destination_lot_id),
      requesterNote: marker,
      intakeSnapshot: {
        source: 'stage10w3-live-path-validation',
        formData: {
          lotId: String(fixture.requested_destination_lot_id),
          unitSerialNumber: marker,
          biosSerialNumber: ''
        }
      },
      matchedUnitSnapshot: {
        source: 'stage10w3-live-path-validation'
      }
    });

    createdRequestId = Number(createResult.unitRequestId);
    assert(Number.isInteger(createdRequestId) && createdRequestId > 0, 'The request model did not return a valid Unit Request ID.');

    const [requesterResult, reviewerResult, detailRequest] = await Promise.all([
      unitRequestModel.listUnitRequests({
        statusFilter: 'pending',
        requestTypeFilter: 'intentional_duplicate',
        requestedByUserId: Number(fixture.requested_by_user_id)
      }),
      unitRequestModel.listUnitRequests({
        statusFilter: 'pending',
        requestTypeFilter: 'intentional_duplicate',
        requestedByUserId: null
      }),
      unitRequestModel.getUnitRequestById(createdRequestId)
    ]);

    const requesterQueue = unifiedRequestQueue.combineRequestResults({
      unitResult: requesterResult,
      overrideResult: { supported: true, requests: [] },
      statusFilter: 'pending',
      requestTypeFilter: 'intentional_duplicate'
    });
    const reviewerQueue = unifiedRequestQueue.combineRequestResults({
      unitResult: reviewerResult,
      overrideResult: { supported: true, requests: [] },
      statusFilter: 'pending',
      requestTypeFilter: 'intentional_duplicate'
    });

    const requesterEntry = requesterQueue.requests.find((request) => request.unitRequestId === createdRequestId);
    const reviewerEntry = reviewerQueue.requests.find((request) => request.unitRequestId === createdRequestId);

    assert(requesterEntry, 'The newly stored request was not retrieved in the requesting Tech queue.');
    assert(reviewerEntry, 'The newly stored request was not retrieved in the Tech Lead+/Management queue.');
    assert(detailRequest && detailRequest.unitRequestId === createdRequestId, 'The newly stored request was not retrievable by its detail route model.');
    assert(requesterEntry.requesterNote === marker, 'The requesting Tech queue did not preserve the submitted note.');
    assert(reviewerEntry.requesterNote === marker, 'The reviewer queue did not preserve the submitted note.');

    console.log(`Stage 10W.3 Intentional Duplicate live path verified with temporary request #${createdRequestId}: feedback render, database storage, requester queue, reviewer queue, and detail retrieval.`);
  } finally {
    try {
      await cleanupRequest(createdRequestId);
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
