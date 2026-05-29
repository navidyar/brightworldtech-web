const overrideRequestModel = require('../models/overrideRequestModel');

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

module.exports = {
  renderOverrideRequestsPage,
  renderOverrideRequestsTable,
  approveOverrideRequest,
  denyOverrideRequest
};