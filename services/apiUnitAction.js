'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
const techUnitModel = require('../models/techUnitModel');
const apiUnitIntake = require('./apiUnitIntake');

class ApiUnitActionError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiUnitActionError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  return String(value || '').trim().toLowerCase() === 'true';
}

function preflightDetails(resolution) {
  return {
    resolution_status: resolution?.status || null,
    match_mode: resolution?.match_mode || null,
    match_count: Number(resolution?.match_count || 0),
    matches: Array.isArray(resolution?.matches) ? resolution.matches : [],
    preflight: resolution?.preflight || null
  };
}

function asActionError(error) {
  if (error instanceof ApiUnitActionError) return error;
  if (error instanceof apiUnitIntake.ApiUnitIntakeError) {
    return new ApiUnitActionError(error.status, error.code, error.message, error.details || null);
  }

  const code = String(error && error.code || '');
  if (code.startsWith('BWT_API_UNIT_ACTION_')) {
    const status = code.endsWith('_DESTINATION_INVALID') ? 422 : 409;
    return new ApiUnitActionError(status, code.replace(/^BWT_/, ''), error.message);
  }
  return error;
}

async function applyUnitAction({ body = {}, userId, roleCodes = [], toolSource }) {
  try {
    if (normalizeBoolean(body.confirm_duplicate_match_creation ?? body.confirmDuplicateMatchCreation)) {
      throw new ApiUnitActionError(
        409,
        'INTENTIONAL_DUPLICATE_USES_COMMIT',
        'Intentional Duplicate creation is confirmed through Commit so the new Unit and Tool data remain atomic.'
      );
    }

    const requestedUnitId = normalizePositiveInteger(body.unit_id ?? body.unitId);
    if (!requestedUnitId) {
      throw new ApiUnitActionError(400, 'UNIT_ID_REQUIRED', 'An existing unit_id is required for an explicit move/takeover action.');
    }

    const resolution = await apiUnitIntake.resolveUnit(body, {
      preflightContext: { userId, roleCodes, toolSource }
    });
    const preflight = resolution.preflight;
    const unitAction = preflight?.unit_action;

    if (!preflight || preflight.read_only !== true) {
      throw new ApiUnitActionError(409, 'PREFLIGHT_REQUIRED', 'A fresh BWTDallas Resolve + Preflight evaluation is required.');
    }

    if (resolution.status !== 'MATCHED' || Number(resolution.unit?.unit_id) !== requestedUnitId) {
      throw new ApiUnitActionError(
        409,
        'UNIT_IDENTITY_CHANGED',
        'The supplied Unit ID does not match the current physical Unit identity. Run Resolve + Preflight again.',
        preflightDetails(resolution)
      );
    }

    if (!unitAction?.action_required || !['move', 'takeover'].includes(String(unitAction.action || ''))) {
      throw new ApiUnitActionError(409, 'UNIT_ACTION_NOT_REQUIRED', 'BWTDallas does not currently require a move/takeover action for this Unit.', preflightDetails(resolution));
    }

    if (unitAction.approval_required) {
      throw new ApiUnitActionError(
        409,
        'UNIT_ACTION_APPROVAL_REQUIRED',
        'Submit the existing Move / Takeover request in the BWTDallas application for Tech Lead+ review, then run Resolve + Preflight again.',
        preflightDetails(resolution)
      );
    }

    const nonActionBlockers = (Array.isArray(preflight.blockers) ? preflight.blockers : [])
      .filter((blocker) => blocker && blocker.code !== 'EXPLICIT_UNIT_ACTION_REQUIRED');
    if (nonActionBlockers.length > 0) {
      throw new ApiUnitActionError(
        409,
        'PREFLIGHT_BLOCKED',
        'BWTDallas Preflight has another acceptance blocker, so the Unit action was not applied.',
        preflightDetails(resolution)
      );
    }

    if (!normalizeBoolean(body.confirm_unit_action ?? body.confirmUnitAction)) {
      throw new ApiUnitActionError(
        409,
        'UNIT_ACTION_CONFIRMATION_REQUIRED',
        `The technician must explicitly confirm the ${unitAction.action} action before BWTDallas changes assignment or Lot.`,
        preflightDetails(resolution)
      );
    }

    const identity = apiUnitIntake.normalizeIdentity(body);
    const result = await techUnitModel.applyApiExplicitUnitAction({
      unitId: requestedUnitId,
      assetTag: identity.assetTag,
      unitSerialNumber: identity.unitSerialNumber,
      biosSerialNumber: identity.biosSerialNumber,
      systemUuid: identity.systemUuid,
      destinationLotId: body.lot_id ?? body.lotId,
      actorUserId: userId,
      actorRoleCodes: roleCodes,
      expectedActionKind: unitAction.action,
      expectedCurrentUnit: preflight.current_unit
    });

    const nextResolution = await apiUnitIntake.resolveUnit(body, {
      preflightContext: { userId, roleCodes, toolSource }
    });

    return {
      status: 'ACTION_APPLIED',
      action: unitAction.action,
      unit_id: requestedUnitId,
      lot_changed: result.lotChanged === true,
      assignment_changed: result.assignmentChanged === true,
      unit: nextResolution.unit || await apiUnitIntake.serializeUnit(requestedUnitId),
      preflight: nextResolution.preflight || null
    };
  } catch (error) {
    throw asActionError(error);
  }
}

module.exports = {
  ApiUnitActionError,
  applyUnitAction
};
