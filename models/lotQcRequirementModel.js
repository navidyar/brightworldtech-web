'use strict';

const { pool } = require('./db');
const unitAuditEventModel = require('./unitAuditEventModel');

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

async function isQcRequirementSchemaReady(connection = pool) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'lots'
       AND COLUMN_NAME = 'qc_required'
     LIMIT 1`
  );

  return Boolean(rows[0]);
}

async function getLotQcRequirement(lotId, connection = pool) {
  const safeLotId = normalizePositiveInteger(lotId);
  if (!safeLotId) {
    return { schemaReady: false, lotId: null, lotName: '', qcRequired: true };
  }

  const schemaReady = await isQcRequirementSchemaReady(connection);
  const [rows] = await connection.query(
    schemaReady
      ? `SELECT lot_id, name, qc_required FROM lots WHERE lot_id = ? LIMIT 1`
      : `SELECT lot_id, name, 1 AS qc_required FROM lots WHERE lot_id = ? LIMIT 1`,
    [safeLotId]
  );
  const row = rows[0] || null;

  return {
    schemaReady,
    lotId: row ? Number(row.lot_id) : safeLotId,
    lotName: row ? String(row.name || '').trim() : '',
    qcRequired: !row || Number(row.qc_required) !== 0
  };
}

async function isLotQcRequired(lotId, connection = pool) {
  return (await getLotQcRequirement(lotId, connection)).qcRequired;
}

function createQcNotRequiredError() {
  const error = new Error('Quality Control is not required for Units in the current Lot.');
  error.code = 'BWT_QC_NOT_REQUIRED';
  return error;
}

async function assertUnitQcRequired({ unitId, connection = pool }) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) throw new Error('Unit ID must be a positive integer.');

  const [rows] = await connection.query(
    `SELECT lot_id FROM units WHERE unit_id = ? LIMIT 1`,
    [safeUnitId]
  );
  const unit = rows[0] || null;
  if (!unit) return { unitId: safeUnitId, lotId: null, lotName: '', qcRequired: true, schemaReady: false };

  const requirement = await getLotQcRequirement(unit.lot_id, connection);
  if (!requirement.qcRequired) throw createQcNotRequiredError();

  return { unitId: safeUnitId, ...requirement };
}

async function insertQcRequirementAudit(connection, {
  unitId,
  actorUserId,
  lotId,
  lotName,
  required,
  previousRequired = null,
  source,
  eventSummary,
  unitWorkCompletionId = null
}) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) return false;

  const normalizedLotName = String(lotName || '').trim() || (lotId ? `Lot #${Number(lotId)}` : 'current Lot');
  const nextText = required ? 'Required' : 'Not required';
  const oldText = previousRequired === null ? null : (previousRequired ? 'Required' : 'Not required');

  await unitAuditEventModel.insertEventWithConnection(connection, {
    unitId: safeUnitId,
    actorUserId: normalizePositiveInteger(actorUserId),
    eventType: required ? 'unit_qc_required' : 'unit_qc_not_required',
    eventSource: source || 'lot_qc_requirement',
    eventSummary: eventSummary || (required
      ? 'Quality Control required for the Unit'
      : 'Quality Control not required for the Unit'),
    metadata: {
      lotId: normalizePositiveInteger(lotId),
      lotName: normalizedLotName,
      qcRequired: Boolean(required),
      ...(normalizePositiveInteger(unitWorkCompletionId)
        ? { unitWorkCompletionId: normalizePositiveInteger(unitWorkCompletionId) }
        : {})
    },
    changes: [
      {
        fieldKey: 'qc_requirement',
        fieldLabel: 'Quality Control Requirement',
        changeType: previousRequired === null ? 'recorded' : 'changed',
        oldValueText: oldText,
        newValueText: nextText,
        oldValue: previousRequired === null ? null : Boolean(previousRequired),
        newValue: Boolean(required),
        sortOrder: 10
      },
      {
        fieldKey: 'qc_requirement_lot',
        fieldLabel: 'Lot',
        changeType: 'recorded',
        oldValueText: null,
        newValueText: normalizedLotName,
        oldValue: null,
        newValue: normalizePositiveInteger(lotId),
        sortOrder: 20
      }
    ]
  });

  return true;
}

async function auditUnitEnteredLot(connection, {
  unitId,
  fromLotId = null,
  toLotId,
  actorUserId,
  source = 'unit_lot_move'
}) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeToLotId = normalizePositiveInteger(toLotId);
  if (!safeUnitId || !safeToLotId || !await isQcRequirementSchemaReady(connection)) return false;

  const [fromRequirement, toRequirement] = await Promise.all([
    fromLotId ? getLotQcRequirement(fromLotId, connection) : Promise.resolve(null),
    getLotQcRequirement(safeToLotId, connection)
  ]);

  if (!toRequirement.qcRequired) {
    return insertQcRequirementAudit(connection, {
      unitId: safeUnitId,
      actorUserId,
      lotId: safeToLotId,
      lotName: toRequirement.lotName,
      required: false,
      previousRequired: fromRequirement && fromRequirement.qcRequired !== toRequirement.qcRequired
        ? fromRequirement.qcRequired
        : null,
      source,
      eventSummary: `Quality Control not required in ${toRequirement.lotName || 'the current Lot'}`
    });
  }

  if (fromRequirement && !fromRequirement.qcRequired) {
    return insertQcRequirementAudit(connection, {
      unitId: safeUnitId,
      actorUserId,
      lotId: safeToLotId,
      lotName: toRequirement.lotName,
      required: true,
      previousRequired: false,
      source,
      eventSummary: `Quality Control required in ${toRequirement.lotName || 'the current Lot'}`
    });
  }

  return false;
}

async function auditUnitCreatedInLot(connection, { unitId, lotId, actorUserId }) {
  return auditUnitEnteredLot(connection, {
    unitId,
    toLotId: lotId,
    actorUserId,
    source: 'tech_unit_create'
  });
}

async function auditCompletionIfNotRequired(connection, {
  unitId,
  lotId,
  actorUserId,
  unitWorkCompletionId
}) {
  if (!await isQcRequirementSchemaReady(connection)) return false;
  const requirement = await getLotQcRequirement(lotId, connection);
  if (requirement.qcRequired) return false;

  return insertQcRequirementAudit(connection, {
    unitId,
    actorUserId,
    lotId,
    lotName: requirement.lotName,
    required: false,
    source: 'tech_unit_completion',
    eventSummary: 'Quality Control not required for this completion cycle',
    unitWorkCompletionId
  });
}

async function auditLotQcRequirementChange(connection, {
  lotId,
  actorUserId,
  previousRequired,
  nextRequired
}) {
  const safeLotId = normalizePositiveInteger(lotId);
  if (!safeLotId || previousRequired === nextRequired || !await isQcRequirementSchemaReady(connection)) return 0;

  const requirement = await getLotQcRequirement(safeLotId, connection);
  const [unitRows] = await connection.query(
    `SELECT unit_id
     FROM units
     WHERE lot_id = ?
     ORDER BY unit_id`,
    [safeLotId]
  );

  let auditedCount = 0;
  for (const row of unitRows) {
    const inserted = await insertQcRequirementAudit(connection, {
      unitId: row.unit_id,
      actorUserId,
      lotId: safeLotId,
      lotName: requirement.lotName,
      required: Boolean(nextRequired),
      previousRequired: Boolean(previousRequired),
      source: 'lot_configuration',
      eventSummary: nextRequired
        ? `Quality Control enabled for ${requirement.lotName || 'the current Lot'}`
        : `Quality Control disabled for ${requirement.lotName || 'the current Lot'}`
    });
    if (inserted) auditedCount += 1;
  }

  return auditedCount;
}

module.exports = {
  assertUnitQcRequired,
  auditCompletionIfNotRequired,
  auditLotQcRequirementChange,
  auditUnitCreatedInLot,
  auditUnitEnteredLot,
  createQcNotRequiredError,
  getLotQcRequirement,
  isLotQcRequired,
  isQcRequirementSchemaReady
};
