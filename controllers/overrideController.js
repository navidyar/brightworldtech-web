const overrideRequestModel = require('../models/overrideRequestModel');
const techUnitModel = require('../models/techUnitModel');
const lotModel = require('../models/lotModel');

const VALID_STATUS_FILTERS = new Set(['pending', 'approved', 'denied', 'cancelled', 'all']);
const ELEVATED_UNIT_MANAGEMENT_ROLES = new Set(['admin', 'management', 'tech_lead']);

function getCurrentRoleCodes(req) {
  return req && req.currentUser && Array.isArray(req.currentUser.roles)
    ? req.currentUser.roles.map((roleCode) => String(roleCode || '').trim())
    : [];
}

function normalizePositiveInteger(value) {
  const numericValue = Number(value);

  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function getOverrideRequestContext(req) {
  const rawValue = req && req.body && req.body.requestContext !== undefined
    ? req.body.requestContext
    : req && req.query
      ? req.query.requestContext
      : '';
  const normalizedValue = String(rawValue || '').trim().toLowerCase();

  return normalizedValue === 'duplicate_intake' ? 'duplicate_intake' : 'manual';
}

function normalizeDuplicateSerial(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 150);
}

function getTechOverrideModalContext(req) {
  const requestContext = getOverrideRequestContext(req);
  const body = req && req.body ? req.body : {};
  const query = req && req.query ? req.query : {};

  return {
    requestContext,
    pageTitle: requestContext === 'duplicate_intake'
      ? 'Request Move / Takeover'
      : 'Request Override',
    duplicateIntakeContext: {
      unitSerialNumber: normalizeDuplicateSerial(body.duplicateIntakeUnitSerialNumber || query.unitSerialNumber),
      biosSerialNumber: normalizeDuplicateSerial(body.duplicateIntakeBiosSerialNumber || query.biosSerialNumber),
      duplicateAssumptionNonce: String(body.duplicateAssumptionNonce || query.duplicateAssumptionNonce || '').trim(),
      destinationLotId: normalizePositiveInteger(body.requestedDestinationLotId || query.destinationLotId)
    }
  };
}

async function hasVerifiedDuplicateIntakeContext(req, unitId, modalContext) {
  if (!modalContext || modalContext.requestContext !== 'duplicate_intake') {
    return true;
  }

  const context = modalContext.duplicateIntakeContext || {};
  const sessionNonce = req && req.session ? String(req.session.duplicateAssumptionCreateNonce || '').trim() : '';

  if (!sessionNonce || !context.duplicateAssumptionNonce || sessionNonce !== context.duplicateAssumptionNonce) {
    return false;
  }

  if (!context.unitSerialNumber && !context.biosSerialNumber) {
    return false;
  }

  const candidates = await techUnitModel.getDuplicateAssumptionCandidates({
    unitSerialNumber: context.unitSerialNumber,
    biosSerialNumber: context.biosSerialNumber,
    destinationLotId: context.destinationLotId,
    actorRoleCodes: getCurrentRoleCodes(req),
    actorUserId: req.currentUser ? req.currentUser.user_id : null
  });

  return candidates.some((candidate) => Number(candidate.unitId) === Number(unitId));
}

function isRegularTechOverrideRequester(req) {
  const roleCodes = getCurrentRoleCodes(req);

  return roleCodes.includes('tech') && !roleCodes.some((roleCode) => ELEVATED_UNIT_MANAGEMENT_ROLES.has(roleCode));
}

function getEffectiveAssignedUserId(unit) {
  if (!unit) {
    return null;
  }

  return normalizePositiveInteger(unit.assigned_to_user_id) || normalizePositiveInteger(unit.created_by_user_id);
}

function getDuplicateIntakeActionKind(req, unit, modalContext = {}) {
  if (!modalContext || modalContext.requestContext !== 'duplicate_intake') {
    return 'override';
  }

  if (techUnitModel.isUnitParked(unit)) {
    return 'takeover';
  }

  const currentUserId = normalizePositiveInteger(req && req.currentUser ? req.currentUser.user_id : null);
  return currentUserId && getEffectiveAssignedUserId(unit) === currentUserId ? 'move' : 'takeover';
}

function getTechOverrideRequestEligibility(req, unit, {
  requestContext = 'manual',
  requestedDestinationLotId = null
} = {}) {
  const fromDuplicateIntake = requestContext === 'duplicate_intake';

  if (!isRegularTechOverrideRequester(req)) {
    return {
      allowed: false,
      message: fromDuplicateIntake
        ? 'Move / Takeover requests are available only to regular Tech users during Create Unit intake. Tech Leads, Management, and Admin can manage the existing Unit directly.'
        : 'Override requests are available only to regular Tech users for units assigned to another Tech. Tech Leads, Management, and Admin manage assignments directly.'
    };
  }

  const isParkedTakeoverRequest = techUnitModel.isUnitParked(unit);
  const currentUserId = normalizePositiveInteger(req && req.currentUser ? req.currentUser.user_id : null);

  if (!currentUserId) {
    return {
      allowed: false,
      message: 'Your current user session could not be verified. Refresh the page and try again.'
    };
  }

  const isAssignedToCurrentUser = !isParkedTakeoverRequest && getEffectiveAssignedUserId(unit) === currentUserId;

  if (!fromDuplicateIntake && isAssignedToCurrentUser) {
    return {
      allowed: false,
      message: 'You cannot request an override for a unit already assigned to you.'
    };
  }

  if (
    fromDuplicateIntake
    && isAssignedToCurrentUser
    && normalizePositiveInteger(unit.lot_id) === normalizePositiveInteger(requestedDestinationLotId)
  ) {
    return {
      allowed: false,
      message: 'This Unit is already assigned to you in the selected destination Lot. Open the existing Unit instead of requesting a takeover of your own assignment.'
    };
  }

  return {
    allowed: true,
    message: ''
  };
}

function getReturnStatus(req) {
  const returnStatus = String(req.body.returnStatus || req.query.status || 'pending').trim().toLowerCase();

  return VALID_STATUS_FILTERS.has(returnStatus) ? returnStatus : 'pending';
}

function getUnifiedReturnUrl(req, overrideRequestId, query = {}) {
  const params = new URLSearchParams({ status: getReturnStatus(req) });
  const requestType = String(req.body.returnRequestType || req.query.requestType || '').trim();
  const search = String(req.body.returnSearch || req.query.search || '').trim();
  if (requestType && requestType !== 'all') params.set('requestType', requestType);
  if (search) params.set('search', search.slice(0, 150));
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  return overrideRequestId
    ? `/unit-requests/override/${encodeURIComponent(overrideRequestId)}?${params.toString()}`
    : `/unit-requests?${params.toString()}`;
}


function getReviewNotes(req) {
  return String(req.body.reviewNotes || '').trim();
}

function priorTechCreditRequested(req) {
  return String(req.body.priorTechCreditGranted || '').trim() === '1';
}

function getPriorTechCreditWeight(req) {
  return String(req.body.priorTechCreditWeight || '').trim();
}

function getDestinationLotId(req) {
  return String(req.body.destinationLotId || '').trim();
}

function getRequestedDestinationLotId(req) {
  const value = req && req.body && req.body.requestedDestinationLotId !== undefined
    ? req.body.requestedDestinationLotId
    : req && req.query
      ? req.query.destinationLotId
      : null;

  return normalizePositiveInteger(value);
}

function resolveRequestedDestinationLotId({ requestedDestinationLotId, unit, assignableLots }) {
  const safeLots = Array.isArray(assignableLots) ? assignableLots : [];
  const requestedId = normalizePositiveInteger(requestedDestinationLotId);
  const currentLotId = normalizePositiveInteger(unit && unit.lot_id);

  if (requestedId && safeLots.some((lot) => Number(lot.lotId) === requestedId)) {
    return requestedId;
  }

  if (currentLotId && safeLots.some((lot) => Number(lot.lotId) === currentLotId)) {
    return currentLotId;
  }

  return null;
}

function getOverrideRequestId(req) {
  const overrideRequestId = Number(req.params.overrideRequestId);

  return Number.isInteger(overrideRequestId) && overrideRequestId > 0 ? overrideRequestId : null;
}

function getUnitId(req) {
  const unitId = Number(req.params.unitId);

  return Number.isInteger(unitId) && unitId > 0 ? unitId : null;
}

function getOverrideReason(req) {
  return String(req.body.reason || '').trim();
}

function buildUnitLabel(unit) {
  if (!unit) {
    return 'Unknown Unit';
  }

  if (unit.asset_number) {
    return techUnitModel.getDisplayAssetTag(unit.asset_number);
  }

  return 'Unit without asset tag';
}

async function getLotLabel(lotId) {
  if (!lotId) {
    return 'No lot selected';
  }

  const lot = await lotModel.getLotById(lotId);

  return lot ? lot.lot_name : 'Lot name not available';
}

async function getUnitCurrentLotLabel(unit) {
  if (techUnitModel.isUnitParked(unit)) {
    return 'Parked · No active lot';
  }

  return getLotLabel(unit && unit.lot_id);
}

async function approveOverrideRequest(req, res, next) {
  try {
    const overrideRequestId = getOverrideRequestId(req);
    const returnStatus = getReturnStatus(req);

    if (!overrideRequestId) {
      return res.status(400).render('pages/error', {
        pageTitle: 'Invalid Override Request',
        message: 'The selected override request ID is invalid.',
        error: null
      });
    }

    const priorTechCreditGranted = priorTechCreditRequested(req);

    const wasApproved = await overrideRequestModel.approveOverrideRequest({
      overrideRequestId,
      reviewedByUserId: req.currentUser.user_id,
      reviewNotes: getReviewNotes(req),
      priorTechCreditGranted,
      priorTechCreditWeight: priorTechCreditGranted ? getPriorTechCreditWeight(req) : null,
      destinationLotId: getDestinationLotId(req)
    });

    if (!wasApproved) {
      return res.redirect(getUnifiedReturnUrl(req, overrideRequestId, { skipped: 'not-pending' }));
    }

    return res.redirect(getUnifiedReturnUrl(req, overrideRequestId, { approved: '1' }));
  } catch (error) {
    if (error && error.code === 'BWT_INVALID_PRIOR_TECH_CREDIT_WEIGHT') {
      return res.redirect(getUnifiedReturnUrl(req, getOverrideRequestId(req), { skipped: 'invalid-prior-credit' }));
    }

    if (error && error.code === 'BWT_OVERRIDE_DESTINATION_LOT_REQUIRED') {
      return res.redirect(getUnifiedReturnUrl(req, getOverrideRequestId(req), { skipped: 'destination-lot-required' }));
    }

    if (error && error.code === 'BWT_UNIT_PARKED') {
      return res.redirect(getUnifiedReturnUrl(req, getOverrideRequestId(req), { skipped: 'unit-parked' }));
    }

    if (error && error.code === 'BWT_INVALID_OVERRIDE_DESTINATION_LOT') {
      return res.redirect(getUnifiedReturnUrl(req, getOverrideRequestId(req), { skipped: 'invalid-destination-lot' }));
    }

    if (error && error.code === 'BWT_LOT_DESTINATION_VALIDATION_BLOCKED') {
      return res.redirect(getUnifiedReturnUrl(req, getOverrideRequestId(req), { skipped: 'destination-validation', detail: String(error.message || '').slice(0, 1000) }));
    }

    if (error && error.code === 'BWT_OVERRIDE_SELF_REVIEW') {
      return res.redirect(getUnifiedReturnUrl(req, getOverrideRequestId(req), { error: 'self-review' }));
    }

    next(error);
  }
}

async function denyOverrideRequest(req, res, next) {
  try {
    const overrideRequestId = getOverrideRequestId(req);
    const returnStatus = getReturnStatus(req);

    if (!overrideRequestId) {
      return res.status(400).render('pages/error', {
        pageTitle: 'Invalid Override Request',
        message: 'The selected override request ID is invalid.',
        error: null
      });
    }

    const wasDenied = await overrideRequestModel.denyOverrideRequest({
      overrideRequestId,
      reviewedByUserId: req.currentUser.user_id,
      reviewNotes: getReviewNotes(req)
    });

    if (!wasDenied) {
      return res.redirect(getUnifiedReturnUrl(req, overrideRequestId, { skipped: 'not-pending' }));
    }

    return res.redirect(getUnifiedReturnUrl(req, overrideRequestId, { rejected: '1' }));
  } catch (error) {
    if (error && error.code === 'BWT_OVERRIDE_SELF_REVIEW') {
      return res.redirect(getUnifiedReturnUrl(req, getOverrideRequestId(req), { error: 'self-review' }));
    }
    next(error);
  }
}

function getDuplicateIntakeRequestWording(modalContext = {}) {
  const moveOnly = modalContext.requestContext === 'duplicate_intake'
    && modalContext.duplicateIntakeActionKind === 'move';

  return {
    requestName: moveOnly ? 'Lot Move' : 'Move / Takeover',
    pendingName: moveOnly ? 'Lot Move request' : 'Move / Takeover request',
    successName: moveOnly ? 'Lot Move request' : 'Move / Takeover request'
  };
}

async function renderTechOverrideRequestModal(req, res, next) {
  const modalContext = getTechOverrideModalContext(req);

  try {
    const unitId = getUnitId(req);

    if (!unitId) {
      return res.status(400).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit: null,
        unitLabel: 'Invalid unit',
        lotLabel: 'Unknown lot',
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['The selected unit ID is invalid.'],
        formData: {
          reason: ''
        }
      });
    }

    const tableIsReady = await overrideRequestModel.overrideTableExists();

    if (!tableIsReady) {
      return res.status(400).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit: null,
        unitLabel: 'Unit without asset tag',
        lotLabel: 'Unknown lot',
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['Override requests are not ready yet. Apply the Stage 7B override lifecycle migration first.'],
        formData: {
          reason: ''
        }
      });
    }

    const unit = await techUnitModel.getUnitById(unitId);

    if (unit) {
      modalContext.duplicateIntakeActionKind = getDuplicateIntakeActionKind(req, unit, modalContext);
      modalContext.isParkedTakeoverRequest = techUnitModel.isUnitParked(unit);
    }

    if (!unit) {
      return res.status(404).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit: null,
        unitLabel: 'Unit not found',
        lotLabel: 'Unknown lot',
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['The selected unit could not be found.'],
        formData: {
          reason: ''
        }
      });
    }

    if (!await hasVerifiedDuplicateIntakeContext(req, unit.unit_id, modalContext)) {
      return res.status(403).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getUnitCurrentLotLabel(unit),
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['This duplicate-intake match is no longer valid. Close Create Unit, reopen it, and refresh the serial match before requesting a move or takeover.'],
        formData: { reason: '' }
      });
    }

    const overrideEligibility = getTechOverrideRequestEligibility(req, unit, {
      requestContext: modalContext.requestContext,
      requestedDestinationLotId: modalContext.duplicateIntakeContext.destinationLotId || getRequestedDestinationLotId(req)
    });
    const requestWording = getDuplicateIntakeRequestWording(modalContext);

    if (!overrideEligibility.allowed) {
      return res.status(403).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getUnitCurrentLotLabel(unit),
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: [overrideEligibility.message],
        formData: {
          reason: ''
        }
      });
    }

    const [existingPendingRequest, assignableLotOptions] = await Promise.all([
      overrideRequestModel.getPendingOverrideRequestForUnit({
        unitId: unit.unit_id,
        requestType: 'manual_tech_override_request'
      }),
      overrideRequestModel.getAssignableLotOptions()
    ]);
    const assignableLots = assignableLotOptions.lots;
    const assignableLotHierarchyOptions = assignableLotOptions.hierarchyOptions;
    const requestedDestinationLotId = existingPendingRequest
      ? existingPendingRequest.requestedDestinationLotId
      : resolveRequestedDestinationLotId({
        requestedDestinationLotId: getRequestedDestinationLotId(req),
        unit,
        assignableLots
      });

    return res.render('fragments/tech-override-request-modal', {
      ...modalContext,
      unit,
      unitLabel: buildUnitLabel(unit),
      lotLabel: await getUnitCurrentLotLabel(unit),
      assignableLots,
      assignableLotHierarchyOptions,
      requestedDestinationLotId,
      existingPendingRequest,
      supported: true,
      successMessage: null,
      errorMessages: [],
      formData: {
        reason: ''
      }
    });
  } catch (error) {
    next(error);
  }
}

async function createTechOverrideRequest(req, res, next) {
  const modalContext = getTechOverrideModalContext(req);

  try {
    const unitId = getUnitId(req);
    const reason = getOverrideReason(req);

    if (!unitId) {
      return res.status(400).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit: null,
        unitLabel: 'Invalid unit',
        lotLabel: 'Unknown lot',
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['The selected unit ID is invalid.'],
        formData: {
          reason
        }
      });
    }

    const unit = await techUnitModel.getUnitById(unitId);

    if (unit) {
      modalContext.duplicateIntakeActionKind = getDuplicateIntakeActionKind(req, unit, modalContext);
      modalContext.isParkedTakeoverRequest = techUnitModel.isUnitParked(unit);
    }

    if (!unit) {
      return res.status(404).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit: null,
        unitLabel: 'Unit not found',
        lotLabel: 'Unknown lot',
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['The selected unit could not be found.'],
        formData: {
          reason
        }
      });
    }

    if (!await hasVerifiedDuplicateIntakeContext(req, unit.unit_id, modalContext)) {
      return res.status(403).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getUnitCurrentLotLabel(unit),
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['This duplicate-intake match is no longer valid. Close Create Unit, reopen it, and refresh the serial match before requesting a move or takeover.'],
        formData: { reason }
      });
    }

    const overrideEligibility = getTechOverrideRequestEligibility(req, unit, {
      requestContext: modalContext.requestContext,
      requestedDestinationLotId: modalContext.duplicateIntakeContext.destinationLotId || getRequestedDestinationLotId(req)
    });
    const requestWording = getDuplicateIntakeRequestWording(modalContext);

    if (!overrideEligibility.allowed) {
      return res.status(403).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getUnitCurrentLotLabel(unit),
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: [overrideEligibility.message],
        formData: {
          reason
        }
      });
    }

    const [existingPendingRequest, assignableLotOptions] = await Promise.all([
      overrideRequestModel.getPendingOverrideRequestForUnit({
        unitId: unit.unit_id,
        requestType: 'manual_tech_override_request'
      }),
      overrideRequestModel.getAssignableLotOptions()
    ]);
    const assignableLots = assignableLotOptions.lots;
    const assignableLotHierarchyOptions = assignableLotOptions.hierarchyOptions;
    const requestedDestinationLotId = resolveRequestedDestinationLotId({
      requestedDestinationLotId: getRequestedDestinationLotId(req),
      unit,
      assignableLots
    });

    if (existingPendingRequest) {
      return res.status(409).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getUnitCurrentLotLabel(unit),
        assignableLots,
        assignableLotHierarchyOptions,
        requestedDestinationLotId: existingPendingRequest.requestedDestinationLotId,
        existingPendingRequest,
        supported: true,
        successMessage: null,
        errorMessages: [modalContext.requestContext === 'duplicate_intake'
          ? `A pending ${requestWording.pendingName} already exists for this Unit. Tech Lead+ must approve or deny it first.`
          : 'A pending override request already exists for this Unit. Tech Lead+ must approve or deny it first.'],
        formData: {
          reason
        }
      });
    }

    const errorMessages = [];

    if (!requestedDestinationLotId) {
      errorMessages.push(modalContext.requestContext === 'duplicate_intake'
        ? `Select an open destination Lot for this ${requestWording.requestName} request.`
        : 'Select an open destination Lot for this override request.');
    }

    if (!reason || reason.length < 10) {
      errorMessages.push('Please enter a reason with at least 10 characters.');
    }

    if (reason.length > 1000) {
      errorMessages.push('Reason must be 1000 characters or fewer.');
    }

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/tech-override-request-modal', {
        ...modalContext,
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getUnitCurrentLotLabel(unit),
        assignableLots,
        assignableLotHierarchyOptions,
        requestedDestinationLotId,
        existingPendingRequest: null,
        supported: true,
        successMessage: null,
        errorMessages,
        formData: {
          reason
        }
      });
    }

    let overrideRequestId;

    try {
      overrideRequestId = await overrideRequestModel.createOverrideRequest({
        unitId: unit.unit_id,
        lotId: unit.lot_id,
        requestedDestinationLotId,
        requestType: 'manual_tech_override_request',
        validationStatus: 'not_checked',
        enforcementDecision: 'manual_request',
        reason,
        requestDetails: {
          source: modalContext.requestContext === 'duplicate_intake'
            ? 'duplicate_intake_existing_unit_request'
            : modalContext.isParkedTakeoverRequest
              ? 'tech_units_parked_takeover_request'
              : 'tech_units_manual_request',
          action_kind: modalContext.requestContext === 'duplicate_intake'
            ? modalContext.duplicateIntakeActionKind
            : modalContext.isParkedTakeoverRequest
              ? 'takeover'
              : 'override',
          source_unit_state: modalContext.isParkedTakeoverRequest ? 'parked' : 'active',
          message: modalContext.requestContext === 'duplicate_intake'
            ? `${requestWording.requestName} request created from duplicate intake.`
            : modalContext.isParkedTakeoverRequest
              ? 'Parked Unit takeover request created from Search Units.'
              : 'Manual override request created from Tech Units.',
          unit_id: unit.unit_id,
          lot_id: unit.lot_id,
          requested_destination_lot_id: requestedDestinationLotId,
          asset_number: unit.asset_number || null,
          duplicate_match_unit_serial_number: modalContext.duplicateIntakeContext.unitSerialNumber || null,
          duplicate_match_bios_serial_number: modalContext.duplicateIntakeContext.biosSerialNumber || null
        },
        requestedByUserId: req.currentUser.user_id
      });
    } catch (error) {
      if (error && error.code === 'BWT_OVERRIDE_ALREADY_PENDING') {
        const pendingRequest = await overrideRequestModel.getPendingOverrideRequestForUnit({
          unitId: unit.unit_id,
          requestType: 'manual_tech_override_request'
        });

        return res.status(409).render('fragments/tech-override-request-modal', {
          ...modalContext,
          unit,
          unitLabel: buildUnitLabel(unit),
          lotLabel: await getUnitCurrentLotLabel(unit),
          assignableLots,
          assignableLotHierarchyOptions,
          requestedDestinationLotId: pendingRequest ? pendingRequest.requestedDestinationLotId : requestedDestinationLotId,
          existingPendingRequest: pendingRequest,
          supported: true,
          successMessage: null,
          errorMessages: [modalContext.requestContext === 'duplicate_intake'
            ? `A pending ${requestWording.pendingName} already exists for this Unit. Tech Lead+ must approve or deny it first.`
            : 'A pending override request already exists for this Unit. Tech Lead+ must approve or deny it first.'],
          formData: { reason }
        });
      }

      throw error;
    }

    const pendingRequest = await overrideRequestModel.getPendingOverrideRequestForUnit({
      unitId: unit.unit_id,
      requestType: 'manual_tech_override_request'
    });

    res.set('HX-Trigger', JSON.stringify({
      'override-requested': {
        unitId: unit.unit_id,
        overrideRequestId
      }
    }));

    return res.render('fragments/tech-override-request-modal', {
      ...modalContext,
      unit,
      unitLabel: buildUnitLabel(unit),
      lotLabel: await getUnitCurrentLotLabel(unit),
      assignableLots,
      assignableLotHierarchyOptions,
      requestedDestinationLotId,
      existingPendingRequest: pendingRequest || {
        unitOverrideRequestId: overrideRequestId,
        requestedDestinationLotId,
        requestedDestinationLotName: assignableLots.find((lot) => Number(lot.lotId) === requestedDestinationLotId)?.lotName || 'Destination Lot'
      },
      supported: true,
      successMessage: modalContext.requestContext === 'duplicate_intake'
        ? `${requestWording.successName} #${overrideRequestId} is pending Tech Lead+ review.`
        : modalContext.isParkedTakeoverRequest
          ? `Parked Unit takeover request #${overrideRequestId} is pending Tech Lead+ review.`
          : `Override request #${overrideRequestId} is pending Tech Lead+ review.`,
      errorMessages: [],
      formData: {
        reason: ''
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  approveOverrideRequest,
  denyOverrideRequest,
  renderTechOverrideRequestModal,
  createTechOverrideRequest
};