const overrideRequestModel = require('../models/overrideRequestModel');
const techUnitModel = require('../models/techUnitModel');
const lotModel = require('../models/lotModel');

const VALID_STATUS_FILTERS = new Set(['pending', 'approved', 'denied', 'cancelled', 'all']);

function getStatusFilter(req) {
  const statusFilter = String(req.query.status || 'pending').trim().toLowerCase();

  return VALID_STATUS_FILTERS.has(statusFilter) ? statusFilter : 'pending';
}

function getSuccessMessage(query) {
  if (query.approved === '1') {
    return 'Override request approved.';
  }

  if (query.denied === '1') {
    return 'Override request denied.';
  }

  if (query.skipped === 'not-pending') {
    return 'That override request was already reviewed by someone else.';
  }

  return null;
}

function getReturnStatus(req) {
  const returnStatus = String(req.body.returnStatus || req.query.status || 'pending').trim().toLowerCase();

  return VALID_STATUS_FILTERS.has(returnStatus) ? returnStatus : 'pending';
}

function getReviewNotes(req) {
  return String(req.body.reviewNotes || '').trim();
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

async function renderOverrideRequestsPage(req, res, next) {
  try {
    const statusFilter = getStatusFilter(req);
    const result = await overrideRequestModel.listOverrideRequests({ statusFilter });

    return res.render('pages/management-overrides', {
      pageTitle: 'Override Requests',
      currentNav: 'management-overrides',
      result,
      statusFilter,
      successMessage: getSuccessMessage(req.query),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderOverrideRequestsTable(req, res, next) {
  try {
    const statusFilter = getStatusFilter(req);
    const result = await overrideRequestModel.listOverrideRequests({ statusFilter });

    return res.render('fragments/override-request-table', {
      result,
      statusFilter
    });
  } catch (error) {
    next(error);
  }
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

    const wasApproved = await overrideRequestModel.approveOverrideRequest({
      overrideRequestId,
      reviewedByUserId: req.currentUser.user_id,
      reviewNotes: getReviewNotes(req)
    });

    if (!wasApproved) {
      return res.redirect(`/management/overrides?status=${encodeURIComponent(returnStatus)}&skipped=not-pending`);
    }

    return res.redirect(`/management/overrides?status=${encodeURIComponent(returnStatus)}&approved=1`);
  } catch (error) {
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
      return res.redirect(`/management/overrides?status=${encodeURIComponent(returnStatus)}&skipped=not-pending`);
    }

    return res.redirect(`/management/overrides?status=${encodeURIComponent(returnStatus)}&denied=1`);
  } catch (error) {
    next(error);
  }
}

async function renderTechOverrideRequestModal(req, res, next) {
  try {
    const unitId = getUnitId(req);

    if (!unitId) {
      return res.status(400).render('fragments/tech-override-request-modal', {
        pageTitle: 'Request Override',
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
        pageTitle: 'Request Override',
        unit: null,
        unitLabel: 'Unit without asset tag',
        lotLabel: 'Unknown lot',
        existingPendingRequest: null,
        supported: false,
        successMessage: null,
        errorMessages: ['Override requests are not ready yet. Run the Step 2j SQL migration first.'],
        formData: {
          reason: ''
        }
      });
    }

    const unit = await techUnitModel.getUnitById(unitId);

    if (!unit) {
      return res.status(404).render('fragments/tech-override-request-modal', {
        pageTitle: 'Request Override',
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

    const existingPendingRequest = await overrideRequestModel.getPendingOverrideRequestForUnit({
      unitId: unit.unit_id,
      lotId: unit.lot_id
    });

    return res.render('fragments/tech-override-request-modal', {
      pageTitle: 'Request Override',
      unit,
      unitLabel: buildUnitLabel(unit),
      lotLabel: await getLotLabel(unit.lot_id),
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
  try {
    const unitId = getUnitId(req);
    const reason = getOverrideReason(req);

    if (!unitId) {
      return res.status(400).render('fragments/tech-override-request-modal', {
        pageTitle: 'Request Override',
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

    if (!unit) {
      return res.status(404).render('fragments/tech-override-request-modal', {
        pageTitle: 'Request Override',
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

    const existingPendingRequest = await overrideRequestModel.getPendingOverrideRequestForUnit({
      unitId: unit.unit_id,
      lotId: unit.lot_id
    });

    if (existingPendingRequest) {
      return res.status(409).render('fragments/tech-override-request-modal', {
        pageTitle: 'Request Override',
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getLotLabel(unit.lot_id),
        existingPendingRequest,
        supported: true,
        successMessage: null,
        errorMessages: ['A pending override request already exists for this unit and lot. Management must approve or deny it first.'],
        formData: {
          reason
        }
      });
    }

    const errorMessages = [];

    if (!reason || reason.length < 10) {
      errorMessages.push('Please enter a reason with at least 10 characters.');
    }

    if (reason.length > 1000) {
      errorMessages.push('Reason must be 1000 characters or fewer.');
    }

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/tech-override-request-modal', {
        pageTitle: 'Request Override',
        unit,
        unitLabel: buildUnitLabel(unit),
        lotLabel: await getLotLabel(unit.lot_id),
        existingPendingRequest: null,
        supported: true,
        successMessage: null,
        errorMessages,
        formData: {
          reason
        }
      });
    }

    const overrideRequestId = await overrideRequestModel.createOverrideRequest({
      unitId: unit.unit_id,
      lotId: unit.lot_id,
      requestType: 'manual_tech_override_request',
      validationStatus: 'not_checked',
      enforcementDecision: 'manual_request',
      reason,
      requestDetails: {
        source: 'tech_units_manual_request',
        message: 'Manual override request created from Tech Units expanded detail menu.',
        unit_id: unit.unit_id,
        lot_id: unit.lot_id,
        asset_number: unit.asset_number || null
      },
      requestedByUserId: req.currentUser.user_id
    });

    res.set('HX-Trigger', 'override-requested');

    return res.render('fragments/tech-override-request-modal', {
      pageTitle: 'Request Override',
      unit,
      unitLabel: buildUnitLabel(unit),
      lotLabel: await getLotLabel(unit.lot_id),
      existingPendingRequest: {
        unitOverrideRequestId: overrideRequestId
      },
      supported: true,
      successMessage: `Override request #${overrideRequestId} was sent to Management.`,
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
  renderOverrideRequestsPage,
  renderOverrideRequestsTable,
  approveOverrideRequest,
  denyOverrideRequest,
  renderTechOverrideRequestModal,
  createTechOverrideRequest
};