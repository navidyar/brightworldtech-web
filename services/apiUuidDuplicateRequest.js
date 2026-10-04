'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
const unitRequestModel = require('../models/unitRequestModel');
const apiUnitIntake = require('./apiUnitIntake');
const { normalizeUuid } = require('./apiUnitIdentity');

class ApiUuidDuplicateRequestError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiUuidDuplicateRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function assertAccess(permissions) {
  if (!(permissions instanceof Set) || !permissions.has('units.create') || !permissions.has('requests.submit')) {
    throw new ApiUuidDuplicateRequestError(403, 'UUID_DUPLICATE_REQUEST_ACCESS_DENIED', 'The units.create and requests.submit permissions are required to submit a UUID duplicate request.');
  }
}

function serializeStatus(request) {
  const requestId = Number(request?.unitRequestId || 0) || null;
  const consumed = Boolean(request?.createdUnitId);
  const approved = request?.status === 'approved';
  return {
    request_id: requestId,
    request_type: request?.requestType || unitRequestModel.INTENTIONAL_DUPLICATE_REQUEST_TYPE,
    status: request?.status || null,
    can_commit: approved && !consumed,
    consumed,
    next_action: request?.status === 'pending' ? 'wait_for_approval' : approved && !consumed ? 'rerun_resolve_then_commit' : ['rejected', 'withdrawn'].includes(request?.status) ? 'stop' : consumed ? 'complete' : null,
    status_endpoint: requestId ? `/api/v1/units/intentional-duplicate-requests/${requestId}` : null,
    request_page: requestId ? `/unit-requests/${requestId}` : null,
    submitted_at: request?.submittedAt || null,
    reviewed_at: request?.reviewedAt || null,
    reviewer_note: request?.reviewerNote || '',
    matched_unit_id: Number(request?.matchedUnitId || 0) || null,
    destination_lot_id: Number(request?.requestedDestinationLotId || 0) || null,
    system_uuid: request?.snapshotDisplay?.systemUuid || request?.intakeSnapshot?.formData?.systemUuid || '',
    message: request?.status === 'pending'
      ? 'The UUID duplicate request is pending authorized review in BWTDallas Requests.'
      : approved && !consumed
        ? 'The UUID duplicate request is approved. Rerun Resolve + Preflight with intentional_duplicate_request_id, then Commit the duplicate once.'
        : consumed
          ? 'The approved UUID duplicate authorization has already been used.'
          : request?.status === 'rejected'
            ? 'The UUID duplicate request was rejected.'
            : request?.status === 'withdrawn'
              ? 'The UUID duplicate request was withdrawn.'
              : 'UUID duplicate request status is unavailable.'
  };
}

async function getOwnedRequest({ requestId, userId }) {
  const safeRequestId = normalizePositiveInteger(requestId);
  if (!safeRequestId) throw new ApiUuidDuplicateRequestError(400, 'INVALID_UUID_DUPLICATE_REQUEST_ID', 'A valid Intentional Duplicate request ID is required.');
  const request = await unitRequestModel.getUnitRequestById(safeRequestId);
  if (!request || !request.isIntentionalDuplicateRequest || !request.isToolUuidDuplicateAuthorization || Number(request.requestedByUserId) !== Number(userId)) {
    throw new ApiUuidDuplicateRequestError(404, 'UUID_DUPLICATE_REQUEST_NOT_FOUND', 'The requested Tool UUID duplicate request was not found for this user.');
  }
  return request;
}

async function getStatus({ requestId, userId }) {
  return serializeStatus(await getOwnedRequest({ requestId, userId }));
}

async function create({ body = {}, userId, roleCodes = [], permissions = new Set(), toolSource }) {
  assertAccess(permissions);
  const requesterNote = normalizeText(body.requester_note ?? body.requesterNote);
  if (requesterNote.length < 10) {
    throw new ApiUuidDuplicateRequestError(422, 'UUID_DUPLICATE_REQUEST_REASON_REQUIRED', 'Explain why this is a separate physical Unit despite the matching System UUID (at least 10 characters).');
  }
  const resolveBody = { ...body };
  delete resolveBody.confirm_duplicate_match_creation;
  delete resolveBody.confirmDuplicateMatchCreation;
  delete resolveBody.intentional_duplicate_request_id;
  delete resolveBody.intentionalDuplicateRequestId;
  const resolution = await apiUnitIntake.resolveUnit(resolveBody, {
    preflightContext: { userId, roleCodes, toolSource }
  });
  if (resolution.creation_policy?.uuid_match_requires_approval !== true) {
    throw new ApiUuidDuplicateRequestError(409, 'UUID_DUPLICATE_REQUEST_NOT_REQUIRED', 'The current identity does not have a valid matching System UUID that requires Intentional Duplicate approval.', resolution);
  }
  const candidateIds = [...new Set((resolution.matches || []).map((candidate) => normalizePositiveInteger(candidate.unit_id)).filter(Boolean))];
  let matchedUnitId = normalizePositiveInteger(body.matched_unit_id ?? body.matchedUnitId);
  if (!matchedUnitId && candidateIds.length === 1) matchedUnitId = candidateIds[0];
  if (!matchedUnitId || !candidateIds.includes(matchedUnitId)) {
    throw new ApiUuidDuplicateRequestError(409, 'UUID_DUPLICATE_MATCH_SELECTION_REQUIRED', 'Choose one of the current matching BWTDallas Units before submitting the UUID duplicate request.', { matches: resolution.matches || [] });
  }
  const candidate = (resolution.matches || []).find((row) => Number(row.unit_id) === matchedUnitId);
  const identity = apiUnitIntake.normalizeIdentity(body);
  const destinationLotId = normalizePositiveInteger(body.lot_id ?? body.lotId);
  const systemUuid = identity.systemUuid;
  if (!destinationLotId || !systemUuid || normalizeUuid(candidate?.system_uuid) !== normalizeUuid(systemUuid)) {
    throw new ApiUuidDuplicateRequestError(409, 'UUID_DUPLICATE_REQUEST_IDENTITY_CHANGED', 'The selected Unit no longer has the same valid System UUID and destination context. Run Resolve + Preflight again.');
  }
  const intakeSnapshot = {
    version: 3,
    workflowMode: unitRequestModel.TOOL_UUID_DUPLICATE_AUTHORIZATION_MODE,
    formData: {
      lotId: String(destinationLotId),
      unitCategoryConfigValueId: String(body.unit_category_config_value_id ?? body.unitCategoryConfigValueId ?? ''),
      unitSerialNumber: identity.unitSerialNumber,
      biosSerialNumber: identity.biosSerialNumber,
      systemUuid
    },
    display: {
      destinationLotName: resolution.selected_lot?.name || '',
      serialSummary: `Unit Serial: ${identity.unitSerialNumber || '—'}; BIOS Serial: ${identity.biosSerialNumber || '—'}`,
      systemUuid,
      existingSystemUuid: candidate.system_uuid || '',
      systemUuidMatchesExisting: true,
      toolSource: String(toolSource || '')
    },
    capturedAt: new Date().toISOString(),
    selectedMatchingUnitId: matchedUnitId
  };
  const matchedUnitSnapshot = {
    unitId: matchedUnitId,
    assetTag: candidate.asset_tag || '',
    lotName: candidate.lot?.name || '',
    unitSerialNumber: candidate.unit_serial_number || '',
    biosSerialNumber: candidate.bios_serial_number || '',
    systemUuid: candidate.system_uuid || '',
    manufacturerLabel: candidate.manufacturer || '',
    modelLabel: candidate.model || '',
    cpuSummary: candidate.processor?.summary || '',
    assignedToName: candidate.assignment?.name || candidate.assignment?.username || ''
  };
  try {
    const result = await unitRequestModel.createIntentionalDuplicateRequest({
      requestedByUserId: userId,
      matchedUnitId,
      requestedDestinationLotId: destinationLotId,
      requesterNote,
      intakeSnapshot,
      matchedUnitSnapshot
    });
    return { ...(await getStatus({ requestId: result.unitRequestId, userId })), existing_request: false };
  } catch (error) {
    if (error?.code === 'BWT_UNIT_REQUEST_ALREADY_PENDING' && error.unitRequestId) {
      return { ...(await getStatus({ requestId: error.unitRequestId, userId })), existing_request: true };
    }
    throw new ApiUuidDuplicateRequestError(422, error?.code || 'UUID_DUPLICATE_REQUEST_FAILED', error?.message || 'The UUID duplicate request could not be submitted.');
  }
}

module.exports = { ApiUuidDuplicateRequestError, create, getStatus, serializeStatus };
