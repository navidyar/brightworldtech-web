'use strict';

const lotModel = require('./lotModel');
const lotValidationOverrideModel = require('./lotValidationOverrideModel');
const {
  buildLotAssignmentSignature,
  buildRequirementSignature
} = require('../services/lotValidationOverridePolicy');
const {
  buildTechLotRequirementWorkflow
} = require('../services/techLotRequirementWorkflow');

async function getActiveManagementAcceptance({ unitId, lotId, requirements }) {
  const safeUnitId = Number(unitId);
  const safeLotId = Number(lotId);

  if (!Number.isSafeInteger(safeUnitId) || safeUnitId <= 0) {
    return null;
  }

  if (!Number.isSafeInteger(safeLotId) || safeLotId <= 0) {
    return null;
  }

  const assignmentState = await lotValidationOverrideModel.getUnitAssignmentState(safeUnitId);

  if (!assignmentState || Number(assignmentState.lot_id) !== safeLotId) {
    return null;
  }

  const requirementSignature = buildRequirementSignature(requirements);
  const lotAssignmentSignature = buildLotAssignmentSignature({
    unitId: assignmentState.unit_id,
    lotId: assignmentState.lot_id,
    latestLotHistoryId: assignmentState.latest_lot_history_id,
    latestLotMovedAt: assignmentState.latest_lot_moved_at,
    unitCreatedAt: assignmentState.created_at
  });
  const overrideMap = await lotValidationOverrideModel.getActiveOverrideMapForLot({
    lotId: safeLotId,
    unitSnapshots: [{
      unitId: safeUnitId,
      lotAssignmentSignature
    }],
    requirementSignature
  });

  return overrideMap.get(safeUnitId) || null;
}

async function buildWorkflowForForm({
  lotId,
  unitId = null,
  formData = {},
  formOptions = {}
} = {}) {
  const safeLotId = Number(lotId || formData.lotId);

  if (!Number.isSafeInteger(safeLotId) || safeLotId <= 0) {
    return null;
  }

  const [lot, requirements] = await Promise.all([
    lotModel.getLotById(safeLotId),
    lotModel.listEffectiveLotRequirements(safeLotId)
  ]);

  if (!lot) {
    const error = new Error('The selected Lot could not be found.');
    error.code = 'BWT_LOT_NOT_FOUND';
    throw error;
  }

  const activeRequirements = requirements.filter((requirement) => Number(requirement.is_active) === 1);
  const activeOverride = await getActiveManagementAcceptance({
    unitId,
    lotId: safeLotId,
    requirements: activeRequirements
  });

  return buildTechLotRequirementWorkflow({
    lot,
    requirements: activeRequirements,
    formData,
    formOptions,
    unitId,
    activeOverride
  });
}

module.exports = {
  buildWorkflowForForm,
  getActiveManagementAcceptance
};
