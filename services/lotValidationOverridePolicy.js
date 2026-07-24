'use strict';

const crypto = require('crypto');

function normalizeScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text === '' ? null : text;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function buildRequirementSignature(requirements = []) {
  const rows = (Array.isArray(requirements) ? requirements : [])
    .filter((requirement) => Number(requirement.is_active ?? requirement.is_required ?? 1) === 1)
    .map((requirement) => ({
      id: Number(requirement.lot_requirement_id || 0),
      typeId: Number(requirement.requirement_type_config_value_id || 0),
      operatorId: Number(requirement.comparison_operator_config_value_id || 0),
      configValueId: Number(requirement.requirement_config_value_id || 0),
      manufacturerId: Number(requirement.manufacturer_id || 0),
      unitModelId: Number(requirement.unit_model_id || 0),
      processorModelId: Number(requirement.processor_model_id || 0),
      text: normalizeScalar(requirement.requirement_text),
      number: normalizeScalar(requirement.requirement_number),
      required: Number(requirement.is_required ?? 1) === 1
    }))
    .sort((left, right) => left.id - right.id);

  return sha256(JSON.stringify(rows));
}

function buildLotAssignmentSignature({
  unitId,
  lotId,
  latestLotHistoryId = null,
  latestLotMovedAt = null,
  unitCreatedAt = null
} = {}) {
  const normalizedUnitId = Number(unitId || 0);
  const normalizedLotId = Number(lotId || 0);

  if (!Number.isSafeInteger(normalizedUnitId) || normalizedUnitId <= 0) {
    throw new Error('A valid Unit ID is required to build a Lot assignment signature.');
  }

  if (!Number.isSafeInteger(normalizedLotId) || normalizedLotId <= 0) {
    throw new Error('A valid Lot ID is required to build a Lot assignment signature.');
  }

  return sha256(JSON.stringify({
    unitId: normalizedUnitId,
    lotId: normalizedLotId,
    latestLotHistoryId: Number(latestLotHistoryId || 0),
    latestLotMovedAt: normalizeScalar(latestLotMovedAt),
    unitCreatedAt: normalizeScalar(unitCreatedAt)
  }));
}

function isOverrideCurrent(override, { requirementSignature, lotAssignmentSignature } = {}) {
  if (!override || String(override.statusCode || override.override_status_code || '') !== 'approved') {
    return false;
  }

  return Boolean(
    requirementSignature
    && lotAssignmentSignature
    && String(override.requirementSignature || override.requirement_signature || '') === String(requirementSignature)
    && String(override.lotAssignmentSignature || override.lot_assignment_signature || '') === String(lotAssignmentSignature)
  );
}

function applyManagementAcceptance(unit, override) {
  const safeUnit = unit || {};
  const technicalStatus = String(safeUnit.status || 'needs_review');
  const technicalStatusLabel = String(safeUnit.statusLabel || 'Needs Review');
  const appliesToCurrentFailure = Boolean(
    override
    && ['rejected', 'needs_review'].includes(technicalStatus)
  );

  return {
    ...safeUnit,
    technicalStatus,
    technicalStatusLabel,
    status: appliesToCurrentFailure ? 'accepted_override' : technicalStatus,
    statusLabel: appliesToCurrentFailure ? 'Accepted by Management' : technicalStatusLabel,
    validationOverride: override || null,
    isManagementAccepted: appliesToCurrentFailure
  };
}

module.exports = {
  applyManagementAcceptance,
  buildLotAssignmentSignature,
  buildRequirementSignature,
  isOverrideCurrent
};
