'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const techUnitModel = require('../models/techUnitModel');
const overrideRequestModel = require('../models/overrideRequestModel');
const unitQcCheckModel = require('../models/unitQcCheckModel');
const unitQcCorrectionModel = require('../models/unitQcCorrectionModel');
const unitLotDestinationValidationModel = require('../models/unitLotDestinationValidationModel');
const unifiedRequestQueue = require('../services/unifiedRequestQueue');
const { getQcReviewActionAvailability } = require('../services/qcReviewActionAvailability');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getUnitColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'units'`
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME || row.column_name || '').toLowerCase()));
}

async function selectUsers() {
  const [techRows] = await pool.query(
    `SELECT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
      WHERE u.is_active = 1
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
      WHERE u.is_active = 1
        AND r.code IN ('admin', 'management', 'tech_lead')
      ORDER BY CASE r.code WHEN 'tech_lead' THEN 1 WHEN 'management' THEN 2 ELSE 3 END, u.user_id
      LIMIT 1`
  );

  const techUserId = Number(techRows[0]?.user_id || 0);
  const reviewerUserId = Number(reviewerRows[0]?.user_id || 0);
  assert(techUserId > 0, 'No active regular Tech user is available for the live-path check.');
  assert(reviewerUserId > 0 && reviewerUserId !== techUserId, 'No separate Tech Lead+, Management, or Admin reviewer is available.');
  return { techUserId, reviewerUserId };
}

async function selectParkedSearchFixture() {
  const columns = await getUnitColumns();
  const parkedParts = [];
  if (columns.has('is_parked')) parkedParts.push('COALESCE(u.is_parked, 0) = 1');
  if (columns.has('is_archived')) parkedParts.push('COALESCE(u.is_archived, 0) = 1');
  assert(parkedParts.length > 0, 'The units table does not expose parked lifecycle state.');

  const [rows] = await pool.query(
    `SELECT
       u.unit_id,
       CAST(u.asset_number AS CHAR) AS asset_number,
       ui.identifier_value
     FROM units u
     LEFT JOIN unit_identifiers ui
       ON ui.unit_id = u.unit_id
      AND NULLIF(TRIM(ui.identifier_value), '') IS NOT NULL
     LEFT JOIN unit_override_requests pending
       ON pending.unit_id = u.unit_id
      AND pending.request_type = 'manual_tech_override_request'
      AND LOWER(pending.request_status) = 'pending'
     WHERE (${parkedParts.join(' OR ')})
       AND pending.unit_override_request_id IS NULL
       AND (
         NULLIF(TRIM(CAST(u.asset_number AS CHAR)), '') IS NOT NULL
         OR NULLIF(TRIM(ui.identifier_value), '') IS NOT NULL
       )
     ORDER BY u.unit_id DESC, ui.unit_identifier_id ASC
     LIMIT 1`
  );
  const row = rows[0] || null;
  assert(row, 'No parked Unit with a searchable identifier and no pending override request is available.');
  return {
    unitId: Number(row.unit_id),
    searchValue: String(row.identifier_value || row.asset_number || '').trim()
  };
}

async function findValidDestinationLot(unitId) {
  const lots = await overrideRequestModel.listAssignableLots();
  for (const lot of lots) {
    try {
      await unitLotDestinationValidationModel.assertExistingUnitDestination({
        unitId,
        destinationLotId: lot.lotId
      });
      return lot;
    } catch (error) {
      // Try the next open Lot; the live fixture may not satisfy every Lot profile.
    }
  }
  throw new Error('No open destination Lot accepts the selected parked Unit under current Lot requirements.');
}

async function verifyParkedSearch(unitFixture, techUserId) {
  const regularTechResult = await techUnitModel.listTechUnits({
    search: unitFixture.searchValue,
    unitState: 'active',
    canViewParkedUnits: false,
    canSearchParkedUnits: true,
    restrictToCurrentAssignment: true,
    currentUserId: techUserId,
    perPage: 'All'
  });
  const match = regularTechResult.units.find((unit) => Number(unit.unitId) === unitFixture.unitId);
  assert(match, `Regular Tech Search Units did not retrieve parked Unit ${unitFixture.unitId}.`);
  assert(match.isParked === true, 'The search result did not retain its Parked state.');
  assert(match.assignedToUserId === null, 'A Parked search result incorrectly retained a current assignment.');
  assert(match.isReadOnlyForCurrentUser === true, 'A regular Tech Parked search result was not kept read-only before approval.');
  assert(regularTechResult.searchIncludesParkedUnits === true, 'The model did not report cross-state search mode.');

  const deniedResult = await techUnitModel.listTechUnits({
    search: unitFixture.searchValue,
    unitState: 'active',
    canViewParkedUnits: false,
    canSearchParkedUnits: false,
    restrictToCurrentAssignment: true,
    currentUserId: techUserId,
    perPage: 'All'
  });
  assert(!deniedResult.units.some((unit) => Number(unit.unitId) === unitFixture.unitId), 'Parked search bypassed the explicit search permission flag.');
}

async function verifySubmissionStorageAndQueues({ unitFixture, destinationLot, techUserId }) {
  const note = `Stage 10W.4 parked takeover live-path ${Date.now()}`;
  let requestId = null;
  try {
    requestId = await overrideRequestModel.createOverrideRequest({
      unitId: unitFixture.unitId,
      lotId: null,
      requestedDestinationLotId: destinationLot.lotId,
      requestType: 'manual_tech_override_request',
      validationStatus: 'not_checked',
      enforcementDecision: 'manual_request',
      reason: note,
      requestDetails: {
        source: 'tech_units_parked_takeover_request',
        action_kind: 'takeover',
        source_unit_state: 'parked',
        unit_id: unitFixture.unitId,
        requested_destination_lot_id: destinationLot.lotId
      },
      requestedByUserId: techUserId
    });
    assert(requestId > 0, 'The real override-request model did not return a request ID.');

    const [storedRows] = await pool.query(
      `SELECT request_status, reason, requested_by_user_id, requested_destination_lot_id
         FROM unit_override_requests
        WHERE unit_override_request_id = ?
        LIMIT 1`,
      [requestId]
    );
    const stored = storedRows[0] || null;
    assert(stored && String(stored.request_status).toLowerCase() === 'pending', 'The parked takeover request was not stored as Pending.');
    assert(String(stored.reason || '') === note, 'The requesting Tech note did not survive database storage.');
    assert(Number(stored.requested_by_user_id) === techUserId, 'The stored requester does not match the regular Tech.');

    const requesterOverrideResult = await overrideRequestModel.listOverrideRequests({
      statusFilter: 'all',
      requestedByUserId: techUserId,
      limit: 250
    });
    const reviewerOverrideResult = await overrideRequestModel.listOverrideRequests({
      statusFilter: 'all',
      requestedByUserId: null,
      limit: 250
    });
    const emptyUnitResult = { supported: true, requests: [] };
    const requesterQueue = unifiedRequestQueue.combineRequestResults({
      unitResult: emptyUnitResult,
      overrideResult: requesterOverrideResult,
      statusFilter: 'pending',
      requestTypeFilter: 'existing_unit_override'
    });
    const reviewerQueue = unifiedRequestQueue.combineRequestResults({
      unitResult: emptyUnitResult,
      overrideResult: reviewerOverrideResult,
      statusFilter: 'pending',
      requestTypeFilter: 'existing_unit_override'
    });
    const requesterItem = requesterQueue.requests.find((request) => Number(request.unitOverrideRequestId) === requestId);
    const reviewerItem = reviewerQueue.requests.find((request) => Number(request.unitOverrideRequestId) === requestId);
    assert(requesterItem, 'The requesting Tech cannot retrieve the parked takeover in the unified Requests queue.');
    assert(reviewerItem, 'Tech Lead+/Management cannot retrieve the parked takeover in the unified Requests queue.');
    assert(requesterItem.requestTypeLabel === 'Parked Unit Takeover', 'The requester queue did not label the request as a Parked Unit Takeover.');
    assert(reviewerItem.requesterNote === note, 'The reviewer queue did not retain the requesting Tech note.');

    const detail = await overrideRequestModel.getOverrideRequestById(requestId);
    assert(detail && detail.isParkedTakeoverRequest === true, 'The reviewer detail model did not identify the Parked takeover context.');
    assert(detail.requesterNote === note, 'The reviewer detail model did not retain the requesting Tech note.');

    return requestId;
  } finally {
    if (requestId) {
      await pool.query('DELETE FROM unit_override_requests WHERE unit_override_request_id = ?', [requestId]);
    }
  }
}

async function verifyApprovalWithRollback({ unitFixture, destinationLot, techUserId, reviewerUserId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [insertResult] = await connection.query(
      `INSERT INTO unit_override_requests (
         unit_id, lot_id, requested_destination_lot_id, request_type, request_status,
         validation_status, enforcement_decision, reason, request_details, requested_by_user_id
       ) VALUES (?, NULL, ?, 'manual_tech_override_request', 'pending', 'not_checked', 'manual_request', ?, ?, ?)`,
      [
        unitFixture.unitId,
        destinationLot.lotId,
        'Stage 10W.4 rollback-only approval verification',
        JSON.stringify({ source: 'tech_units_parked_takeover_request', action_kind: 'takeover', source_unit_state: 'parked' }),
        techUserId
      ]
    );
    const requestId = Number(insertResult.insertId);
    const approved = await overrideRequestModel.approveOverrideRequest({
      overrideRequestId: requestId,
      reviewedByUserId: reviewerUserId,
      reviewNotes: 'Stage 10W.4 rollback-only approval verification',
      destinationLotId: destinationLot.lotId,
      connection
    });
    assert(approved === true, 'The parked takeover approval path did not complete inside the rollback transaction.');

    const [requestRows] = await connection.query(
      'SELECT request_status FROM unit_override_requests WHERE unit_override_request_id = ?',
      [requestId]
    );
    assert(String(requestRows[0]?.request_status || '').toLowerCase() === 'approved', 'The request was not marked Approved inside the transaction.');

    const columns = await getUnitColumns();
    const parkedSql = columns.has('is_parked') ? 'COALESCE(is_parked, 0)' : 'COALESCE(is_archived, 0)';
    const [unitRows] = await connection.query(
      `SELECT unit_id, lot_id, assigned_to_user_id, ${parkedSql} AS is_parked
         FROM units
        WHERE unit_id = ?
        LIMIT 1`,
      [unitFixture.unitId]
    );
    const unit = unitRows[0] || null;
    assert(unit && Number(unit.is_parked) === 0, 'Approval did not return the Unit to Active inside the transaction.');
    assert(Number(unit.lot_id) === destinationLot.lotId, 'Approval did not place the Unit in the selected destination Lot.');
    assert(Number(unit.assigned_to_user_id) === techUserId, 'Approval did not assign the Unit to the requesting Tech.');
  } finally {
    await connection.rollback();
    connection.release();
  }
}

async function selectLatestQcFixtures() {
  const [rows] = await pool.query(
    `SELECT qc.unit_id, qc.unit_work_completion_id, qc.unit_qc_check_id, qc.decision_code
       FROM unit_qc_checks qc
       INNER JOIN (
         SELECT unit_work_completion_id, MAX(unit_qc_check_id) AS latest_qc_check_id
           FROM unit_qc_checks
          GROUP BY unit_work_completion_id
       ) latest ON latest.latest_qc_check_id = qc.unit_qc_check_id
       INNER JOIN unit_work_completions uwc
         ON uwc.unit_work_completion_id = qc.unit_work_completion_id
        AND uwc.reversed_at IS NULL
      WHERE qc.decision_code IN ('accepted', 'rejected')
      ORDER BY qc.unit_qc_check_id DESC
      LIMIT 50`
  );
  return rows;
}

async function verifyQcDecisionStateLivePath() {
  const fixtures = await selectLatestQcFixtures();
  assert(fixtures.length > 0, 'No current accepted or rejected QC decision is available for the live-path check.');
  const unitIds = [...new Set(fixtures.map((row) => Number(row.unit_id)).filter((value) => value > 0))];
  const completionMap = await techUnitModel.getLatestWorkCompletionMapForUnits(unitIds);
  const completionIds = [...completionMap.values()].map((completion) => Number(completion.unitWorkCompletionId));
  const reviewMap = await unitQcCheckModel.listLatestQcChecksForCompletions(completionIds);
  const rejectedCheckIds = [...reviewMap.values()].filter((review) => review.decisionCode === 'rejected').map((review) => Number(review.qcCheckId));
  const correctionMap = await unitQcCorrectionModel.listLatestCorrectionsForQcChecks(rejectedCheckIds);
  let acceptedVerified = 0;
  let rejectedVerified = 0;
  let readyForRecheckVerified = 0;

  for (const unitId of unitIds) {
    const completion = completionMap.get(unitId);
    if (!completion) continue;
    const review = reviewMap.get(Number(completion.unitWorkCompletionId));
    if (!review) continue;
    const correction = review.decisionCode === 'rejected' ? correctionMap.get(Number(review.qcCheckId)) || null : null;
    const state = getQcReviewActionAvailability({
      hasCompletion: true,
      isParked: false,
      latestDecisionCode: review.decisionCode,
      hasCorrection: Boolean(correction)
    });
    if (review.decisionCode === 'accepted') {
      assert(state.acceptEnabled === false && state.rejectEnabled === false, `Accepted Unit ${unitId} still exposes a QC decision.`);
      acceptedVerified += 1;
    } else if (correction) {
      assert(state.acceptEnabled === true && state.rejectEnabled === true, `Corrected Unit ${unitId} did not re-enable QC recheck decisions.`);
      readyForRecheckVerified += 1;
    } else {
      assert(state.acceptEnabled === false && state.rejectEnabled === false, `Rejected Unit ${unitId} still exposes a repeated QC decision.`);
      rejectedVerified += 1;
    }
  }
  assert(acceptedVerified + rejectedVerified + readyForRecheckVerified > 0, 'No current QC state could be verified.');
  return { acceptedVerified, rejectedVerified, readyForRecheckVerified };
}

async function main() {
  try {
    const users = await selectUsers();
    const unitFixture = await selectParkedSearchFixture();
    const destinationLot = await findValidDestinationLot(unitFixture.unitId);
    await verifyParkedSearch(unitFixture, users.techUserId);
    await verifySubmissionStorageAndQueues({ unitFixture, destinationLot, techUserId: users.techUserId });
    await verifyApprovalWithRollback({ unitFixture, destinationLot, ...users });
    const qcCoverage = await verifyQcDecisionStateLivePath();

    console.log(
      `Stage 10W.4 live path verified: regular Tech search found parked Unit ${unitFixture.unitId}; `
      + 'temporary takeover submission reached database storage, requester queue, reviewer queue, and detail retrieval; '
      + `approval returned the Unit to Active in Lot ${destinationLot.lotId} and assigned the requester inside a rolled-back transaction; `
      + `QC states verified for ${qcCoverage.acceptedVerified} accepted, ${qcCoverage.rejectedVerified} rejected-awaiting-correction, `
      + `and ${qcCoverage.readyForRecheckVerified} ready-for-recheck Unit(s).`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
