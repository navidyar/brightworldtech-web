'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const unitRequestModel = require('../models/unitRequestModel');
const unifiedRequestQueue = require('../services/unifiedRequestQueue');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertSchema() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS ready
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_processor_catalog_requests'
        AND COLUMN_NAME = 'requested_processor_speed_ghz'
        AND DATA_TYPE = 'decimal'
        AND NUMERIC_PRECISION = 5
        AND NUMERIC_SCALE = 2
        AND IS_NULLABLE = 'YES'`
  );
  assert(Number(rows[0]?.ready || 0) === 1, 'Stage 10W.5 requested_processor_speed_ghz storage is not ready.');
}

async function selectFixture() {
  const [techRows] = await pool.query(
    `SELECT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
      WHERE COALESCE(u.is_active, 1) = 1
      GROUP BY u.user_id
     HAVING SUM(r.code = 'tech') > 0
        AND SUM(r.code IN ('admin', 'management', 'tech_lead')) = 0
      ORDER BY u.user_id
      LIMIT 1`
  );
  const [reviewerRows] = await pool.query(
    `SELECT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
      WHERE COALESCE(u.is_active, 1) = 1
        AND r.code IN ('admin', 'management')
      ORDER BY CASE r.code WHEN 'management' THEN 1 ELSE 2 END, u.user_id
      LIMIT 1`
  );
  const [modelRows] = await pool.query(
    `SELECT um.unit_model_id, um.model_name
       FROM unit_models um
       JOIN manufacturers m ON m.manufacturer_id = um.manufacturer_id
      WHERE um.is_active = 1
        AND COALESCE(m.is_active, 1) = 1
      ORDER BY um.unit_model_id
      LIMIT 1`
  );

  const techUserId = Number(techRows[0]?.user_id || 0);
  const reviewerUserId = Number(reviewerRows[0]?.user_id || 0);
  const unitModelId = Number(modelRows[0]?.unit_model_id || 0);

  assert(techUserId > 0, 'No active regular Tech is available for the Processor request live-path check.');
  assert(reviewerUserId > 0 && reviewerUserId !== techUserId, 'No separate Management/Admin reviewer is available.');
  assert(unitModelId > 0, 'No active managed Unit Model is available for the Processor request live-path check.');

  return {
    techUserId,
    reviewerUserId,
    unitModelId,
    unitModelName: String(modelRows[0]?.model_name || `Unit Model #${unitModelId}`)
  };
}

async function cleanupRequest(unitRequestId) {
  if (!unitRequestId) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM unit_request_events WHERE unit_request_id = ?', [unitRequestId]);
    await connection.query('DELETE FROM unit_processor_catalog_requests WHERE unit_request_id = ?', [unitRequestId]);
    await connection.query('DELETE FROM unit_requests WHERE unit_request_id = ?', [unitRequestId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function verifySubmissionAndQueues({ fixture, marker, requestedType, requestedProcessor, requestedSpeed }) {
  const result = await unitRequestModel.createProcessorCatalogRequest({
    requestedByUserId: fixture.techUserId,
    unitModelId: fixture.unitModelId,
    requestedProcessorType: requestedType,
    requestedProcessorName: requestedProcessor,
    requestedProcessorSpeedGhz: requestedSpeed,
    requesterNote: marker
  });
  const unitRequestId = Number(result.unitRequestId || 0);
  assert(unitRequestId > 0, 'The Processor Catalog request model did not return a Unit Request ID.');

  const [storedRows] = await pool.query(
    `SELECT ur.status, ur.requester_note, upcr.requested_processor_type,
            upcr.requested_processor_name, upcr.requested_processor_speed_ghz
       FROM unit_requests ur
       JOIN unit_processor_catalog_requests upcr
         ON upcr.unit_request_id = ur.unit_request_id
      WHERE ur.unit_request_id = ?
      LIMIT 1`,
    [unitRequestId]
  );
  const stored = storedRows[0] || null;
  assert(stored && stored.status === 'pending', 'The Processor Catalog request was not stored as Pending.');
  assert(String(stored.requester_note || '') === marker, 'The Tech request note did not survive database storage.');
  assert(String(stored.requested_processor_type || '') === requestedType, 'The requested Processor Type did not survive database storage.');
  assert(String(stored.requested_processor_name || '') === requestedProcessor, 'The requested Processor did not survive database storage.');
  assert(Number(stored.requested_processor_speed_ghz) === Number(requestedSpeed), 'The requested Processor Speed did not survive database storage.');

  const [requesterResult, reviewerResult, detail] = await Promise.all([
    unitRequestModel.listUnitRequests({
      statusFilter: 'pending',
      requestTypeFilter: 'processor_catalog_addition',
      requestedByUserId: fixture.techUserId
    }),
    unitRequestModel.listUnitRequests({
      statusFilter: 'pending',
      requestTypeFilter: 'processor_catalog_addition',
      requestedByUserId: null
    }),
    unitRequestModel.getUnitRequestById(unitRequestId)
  ]);

  const requesterQueue = unifiedRequestQueue.combineRequestResults({
    unitResult: requesterResult,
    overrideResult: { supported: true, requests: [] },
    statusFilter: 'pending',
    requestTypeFilter: 'processor_catalog_addition'
  });
  const reviewerQueue = unifiedRequestQueue.combineRequestResults({
    unitResult: reviewerResult,
    overrideResult: { supported: true, requests: [] },
    statusFilter: 'pending',
    requestTypeFilter: 'processor_catalog_addition'
  });
  const requesterEntry = requesterQueue.requests.find((request) => Number(request.unitRequestId) === unitRequestId);
  const reviewerEntry = reviewerQueue.requests.find((request) => Number(request.unitRequestId) === unitRequestId);

  assert(requesterEntry, 'The requesting Tech cannot retrieve the Processor Catalog request from the unified Requests queue.');
  assert(reviewerEntry, 'Management/Admin cannot retrieve the Processor Catalog request from the unified Requests queue.');
  assert(detail && Number(detail.unitRequestId) === unitRequestId, 'The Processor Catalog request detail model could not retrieve the stored request.');
  assert(requesterEntry.requesterNote === marker && reviewerEntry.requesterNote === marker, 'The Tech request note did not survive unified-queue retrieval.');
  assert(detail.catalogContext?.requestedProcessorType === requestedType, 'Request detail did not retain the Processor Type.');
  assert(detail.catalogContext?.requestedProcessorName === requestedProcessor, 'Request detail did not retain the Processor.');
  assert(Number(detail.catalogContext?.requestedProcessorSpeedGhz) === Number(requestedSpeed), 'Request detail did not retain the Processor Speed.');

  return unitRequestId;
}

async function verifyApprovalWithRollback({ fixture, unitRequestId, requestedType, requestedProcessor, requestedSpeed }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const approval = await unitRequestModel.approveProcessorCatalogRequest({
      unitRequestId,
      reviewedByUserId: fixture.reviewerUserId,
      reviewerNote: 'Stage 10W.5 rollback-only approval verification',
      approvedProcessorBrandId: '',
      approvedProcessorBrandName: requestedType,
      approvedProcessorModelCode: requestedProcessor,
      approvedProcessorFamily: 'Stage 10W.5 Validation',
      approvedProcessorGeneration: 'Validation',
      approvedProcessorBaseSpeedGhz: requestedSpeed,
      connection
    });

    assert(approval.approved === true, 'The real Processor Catalog approval model did not approve inside the rollback transaction.');
    assert(Number(approval.approvedProcessorBrandId) > 0, 'Approval did not create or resolve a Processor Type.');
    assert(Number(approval.approvedProcessorModelId) > 0, 'Approval did not create or resolve a Processor.');

    const [requestRows] = await connection.query(
      `SELECT ur.status, upcr.approved_processor_brand_id, upcr.approved_processor_model_id
         FROM unit_requests ur
         JOIN unit_processor_catalog_requests upcr ON upcr.unit_request_id = ur.unit_request_id
        WHERE ur.unit_request_id = ?`,
      [unitRequestId]
    );
    const approvedRequest = requestRows[0] || null;
    assert(approvedRequest?.status === 'approved', 'Approval did not mark the request Approved inside the transaction.');

    const [catalogRows] = await connection.query(
      `SELECT pb.name AS processor_type, pm.model_code, pm.base_speed_ghz, umpo.is_active
         FROM processor_brands pb
         JOIN processor_models pm ON pm.processor_brand_id = pb.processor_brand_id
         JOIN unit_model_processor_options umpo ON umpo.processor_model_id = pm.processor_model_id
        WHERE pb.processor_brand_id = ?
          AND pm.processor_model_id = ?
          AND umpo.unit_model_id = ?
        LIMIT 1`,
      [approval.approvedProcessorBrandId, approval.approvedProcessorModelId, fixture.unitModelId]
    );
    const catalog = catalogRows[0] || null;
    assert(catalog, 'Approval did not create the Processor catalog and Unit Model compatibility mapping.');
    assert(String(catalog.processor_type || '') === requestedType, 'Approval did not preserve the canonical Processor Type.');
    assert(String(catalog.model_code || '') === requestedProcessor, 'Approval did not preserve the canonical Processor.');
    assert(Number(catalog.base_speed_ghz) === Number(requestedSpeed), 'Approval did not preserve the confirmed Processor Speed.');
    assert(Number(catalog.is_active) === 1, 'The approved Processor mapping is not active for the selected Unit Model.');
  } finally {
    await connection.rollback();
    connection.release();
  }

  const pendingAgain = await unitRequestModel.getUnitRequestById(unitRequestId);
  assert(pendingAgain?.status === 'pending', 'Rollback did not restore the temporary Processor request to Pending.');
  assert(!pendingAgain.catalogContext?.approvedProcessorModelId, 'Rollback left an approved Processor attached to the temporary request.');
}

async function main() {
  let unitRequestId = null;
  try {
    await assertSchema();
    const fixture = await selectFixture();
    const unique = `${Date.now()}-${process.pid}`;
    const requestedType = `Stage10W5 Type ${unique}`;
    const requestedProcessor = `Stage10W5 CPU ${unique}`;
    const requestedSpeed = '3.27';
    const marker = `Stage 10W.5 live path ${unique}`;

    unitRequestId = await verifySubmissionAndQueues({
      fixture,
      marker,
      requestedType,
      requestedProcessor,
      requestedSpeed
    });
    await verifyApprovalWithRollback({
      fixture,
      unitRequestId,
      requestedType,
      requestedProcessor,
      requestedSpeed
    });

    console.log(
      `Stage 10W.5 Processor Catalog live path verified with temporary request #${unitRequestId}: `
      + 'submission reached database storage, the requesting Tech queue, the Management/Admin queue, and request detail; '
      + `approval created Processor Type, Processor, ${requestedSpeed} GHz speed, and Unit Model ${fixture.unitModelName} compatibility inside a rolled-back transaction.`
    );
  } finally {
    try {
      await cleanupRequest(unitRequestId);
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
