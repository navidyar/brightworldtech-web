const unitRequestModel = require('../models/unitRequestModel');

const REVIEW_ROLE_CODES = new Set(['admin', 'management', 'tech_lead']);
const CATALOG_MANAGER_ROLE_CODES = new Set(['admin', 'management']);
const MAX_QUEUE_SEARCH_LENGTH = 150;

function getCurrentRoleCodes(req) {
  return req && req.currentUser && Array.isArray(req.currentUser.roles)
    ? req.currentUser.roles.map((roleCode) => String(roleCode || '').trim())
    : [];
}

function isUnitRequestReviewer(req) {
  return getCurrentRoleCodes(req).some((roleCode) => REVIEW_ROLE_CODES.has(roleCode));
}

function canManageCatalogRequests(req) {
  return getCurrentRoleCodes(req).some((roleCode) => CATALOG_MANAGER_ROLE_CODES.has(roleCode));
}

function isRegularTechRequester(req) {
  const roleCodes = getCurrentRoleCodes(req);
  return roleCodes.includes('tech') && !roleCodes.some((roleCode) => REVIEW_ROLE_CODES.has(roleCode));
}

function getStatusFilter(req) {
  const requestedStatus = req && req.query ? req.query.status : null;
  const postedReturnStatus = req && req.body ? req.body.returnStatus : null;
  return unitRequestModel.normalizeStatusFilter(requestedStatus || postedReturnStatus || 'pending');
}

function getQueueFilters(req) {
  const requestedRequestType = req && req.query && req.query.requestType !== undefined
    ? req.query.requestType
    : req?.body?.returnRequestType;
  const requestedSearch = req && req.query && req.query.search !== undefined
    ? req.query.search
    : req?.body?.returnSearch;

  // The queue now filters the already-authorized list in the browser. Keep the
  // visible phrase exactly as entered (including an unfinished trailing space)
  // for detail navigation and return links; it is no longer used in SQL.
  const searchTerm = String(requestedSearch ?? '').slice(0, MAX_QUEUE_SEARCH_LENGTH);

  return {
    statusFilter: getStatusFilter(req),
    requestTypeFilter: unitRequestModel.normalizeRequestTypeFilter(requestedRequestType || 'all'),
    searchTerm
  };
}

function getUnitRequestId(req) {
  const unitRequestId = Number(req.params.unitRequestId);
  return Number.isInteger(unitRequestId) && unitRequestId > 0 ? unitRequestId : null;
}

function getReturnUrl(unitRequestId, queueFilters, query = {}) {
  const params = new URLSearchParams({ status: queueFilters?.statusFilter || 'pending' });

  if (queueFilters?.requestTypeFilter && queueFilters.requestTypeFilter !== 'all') {
    params.set('requestType', queueFilters.requestTypeFilter);
  }

  if (queueFilters?.searchTerm) {
    params.set('search', queueFilters.searchTerm);
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });

  return unitRequestId
    ? `/unit-requests/${encodeURIComponent(unitRequestId)}?${params.toString()}`
    : `/unit-requests?${params.toString()}`;
}

function getSuccessMessage(query) {
  if (query.submitted === '1') return 'Intentional Duplicate request submitted for review.';
  if (query.withdrawn === '1') return 'Unit Request withdrawn.';
  if (query.approved === '1') {
    if (query.catalog === 'model') return query.result
      ? `Model Catalog request approved. ${query.result} is now available.`
      : 'Model Catalog request approved.';
    if (query.catalog === 'processor') return query.result
      ? `Processor Catalog request approved. ${query.result} is now available for the requested Unit Model.`
      : 'Processor Catalog request approved.';
    return query.assetTag
      ? `Intentional Duplicate request approved. ${query.assetTag} was created.`
      : 'Intentional Duplicate request approved.';
  }
  if (query.rejected === '1') return 'Unit Request rejected.';
  if (query.skipped === 'not-pending') return 'That Unit Request was already reviewed or withdrawn.';
  return null;
}

function getErrorMessages(query) {
  if (query.error === 'rejection-note-required') return ['Enter a rejection note before rejecting this request.'];
  if (query.error === 'destination-invalid') return ['The originally requested destination lot is no longer open, visible, and assignable. Reject this request and have the Tech submit a new request with a current lot.'];
  if (query.error === 'self-review') return ['You cannot approve your own Unit Request.'];
  if (query.error === 'not-owner') return ['You can withdraw only your own pending Unit Requests.'];
  if (query.error === 'catalog-permission') return ['Only Management and Admin can approve or reject Catalog Exception requests.'];
  if (query.error === 'catalog-input') return ['Complete the canonical catalog values before approving this request.'];
  return [];
}

function canViewRequest(req, request) {
  if (!request) return false;
  return isUnitRequestReviewer(req) || Number(request.requestedByUserId) === Number(req.currentUser?.user_id);
}

function isCatalogRequest(request) {
  return Boolean(request && request.isCatalogRequest);
}

async function renderUnitRequestsPage(req, res, next) {
  try {
    const queueFilters = getQueueFilters(req);
    const reviewer = isUnitRequestReviewer(req);
    const requesterUserId = reviewer ? null : req.currentUser.user_id;
    // Search and Request Type are live client-side filters on the queue. Load
    // the full role-scoped data set for the selected status tab so typing never
    // causes another request, SQL search, or focus/caret interruption.
    const result = await unitRequestModel.listUnitRequests({
      statusFilter: queueFilters.statusFilter,
      requestTypeFilter: 'all',
      searchTerm: '',
      requestedByUserId: requesterUserId
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return res.render('pages/unit-requests', {
      pageTitle: 'Unit Requests',
      currentNav: 'unit-requests',
      result,
      statusFilter: queueFilters.statusFilter,
      requestTypeFilter: queueFilters.requestTypeFilter,
      searchTerm: queueFilters.searchTerm,
      canReviewRequests: reviewer,
      canManageCatalogRequests: canManageCatalogRequests(req),
      isRegularTechRequester: isRegularTechRequester(req),
      successMessage: getSuccessMessage(req.query),
      errorMessages: getErrorMessages(req.query)
    });
  } catch (error) {
    next(error);
  }
}

async function renderUnitRequestDetail(req, res, next) {
  try {
    const unitRequestId = getUnitRequestId(req);
    if (!unitRequestId) {
      return res.status(404).render('pages/not-found', { pageTitle: 'Unit Request Not Found', requestedPath: req.originalUrl });
    }

    const request = await unitRequestModel.getUnitRequestById(unitRequestId);
    if (!request || !canViewRequest(req, request)) {
      return res.status(404).render('pages/not-found', { pageTitle: 'Unit Request Not Found', requestedPath: req.originalUrl });
    }

    const queueFilters = getQueueFilters(req);
    const catalogManager = canManageCatalogRequests(req);
    const canReviewThisRequest = isUnitRequestReviewer(req) && (!isCatalogRequest(request) || catalogManager);
    const processorBrands = request.requestType === unitRequestModel.PROCESSOR_CATALOG_REQUEST_TYPE && catalogManager
      ? await unitRequestModel.listActiveProcessorBrands()
      : [];

    return res.render('pages/unit-request-detail', {
      pageTitle: `Unit Request #${unitRequestId}`,
      currentNav: 'unit-requests',
      request,
      statusFilter: queueFilters.statusFilter,
      requestTypeFilter: queueFilters.requestTypeFilter,
      searchTerm: queueFilters.searchTerm,
      unitRequestQueueUrl: getReturnUrl(null, queueFilters),
      canReviewRequests: isUnitRequestReviewer(req),
      canManageCatalogRequests: catalogManager,
      canReviewThisRequest,
      canWithdrawRequest: request.isPending && Number(request.requestedByUserId) === Number(req.currentUser.user_id),
      processorBrands,
      successMessage: getSuccessMessage(req.query),
      errorMessages: getErrorMessages(req.query)
    });
  } catch (error) {
    next(error);
  }
}

async function withdrawUnitRequest(req, res, next) {
  try {
    const unitRequestId = getUnitRequestId(req);
    const queueFilters = getQueueFilters(req);
    if (!unitRequestId) return res.redirect(getReturnUrl(null, queueFilters));

    await unitRequestModel.withdrawUnitRequest({
      unitRequestId,
      requestedByUserId: req.currentUser.user_id,
      withdrawalNote: req.body.withdrawalNote
    });

    return res.redirect(getReturnUrl(unitRequestId, queueFilters, { withdrawn: '1' }));
  } catch (error) {
    if (error?.code === 'BWT_UNIT_REQUEST_NOT_OWNER') return res.redirect(getReturnUrl(getUnitRequestId(req), getQueueFilters(req), { error: 'not-owner' }));
    if (error?.code === 'BWT_UNIT_REQUEST_NOT_PENDING') return res.redirect(getReturnUrl(getUnitRequestId(req), getQueueFilters(req), { skipped: 'not-pending' }));
    next(error);
  }
}

async function approveUnitRequest(req, res, next) {
  try {
    const unitRequestId = getUnitRequestId(req);
    const queueFilters = getQueueFilters(req);
    if (!unitRequestId) return res.redirect(getReturnUrl(null, queueFilters));

    const request = await unitRequestModel.getUnitRequestById(unitRequestId);
    if (!request) return res.redirect(getReturnUrl(null, queueFilters));

    if (isCatalogRequest(request) && !canManageCatalogRequests(req)) {
      return res.redirect(getReturnUrl(unitRequestId, queueFilters, { error: 'catalog-permission' }));
    }

    let result;
    let catalogType = '';

    if (request.requestType === unitRequestModel.MODEL_CATALOG_REQUEST_TYPE) {
      catalogType = 'model';
      result = await unitRequestModel.approveModelCatalogRequest({
        unitRequestId,
        reviewedByUserId: req.currentUser.user_id,
        reviewerNote: req.body.reviewerNote,
        approvedModelName: req.body.approvedModelName
      });
    } else if (request.requestType === unitRequestModel.PROCESSOR_CATALOG_REQUEST_TYPE) {
      catalogType = 'processor';
      result = await unitRequestModel.approveProcessorCatalogRequest({
        unitRequestId,
        reviewedByUserId: req.currentUser.user_id,
        reviewerNote: req.body.reviewerNote,
        approvedProcessorBrandId: req.body.approvedProcessorBrandId,
        approvedProcessorModelCode: req.body.approvedProcessorModelCode,
        approvedProcessorFamily: req.body.approvedProcessorFamily,
        approvedProcessorGeneration: req.body.approvedProcessorGeneration,
        approvedProcessorBaseSpeedGhz: req.body.approvedProcessorBaseSpeedGhz
      });
    } else {
      result = await unitRequestModel.approveIntentionalDuplicateRequest({
        unitRequestId,
        reviewedByUserId: req.currentUser.user_id,
        reviewerNote: req.body.reviewerNote
      });
    }

    if (!result.approved) return res.redirect(getReturnUrl(unitRequestId, queueFilters, { skipped: 'not-pending' }));

    return res.redirect(getReturnUrl(unitRequestId, queueFilters, catalogType
      ? { approved: '1', catalog: catalogType, result: result.resultLabel || '' }
      : { approved: '1', assetTag: result.createdAssetTag || '' }
    ));
  } catch (error) {
    const unitRequestId = getUnitRequestId(req);
    const queueFilters = getQueueFilters(req);
    if (error?.code === 'BWT_UNIT_REQUEST_DESTINATION_INVALID') return res.redirect(getReturnUrl(unitRequestId, queueFilters, { error: 'destination-invalid' }));
    if (error?.code === 'BWT_UNIT_REQUEST_SELF_REVIEW') return res.redirect(getReturnUrl(unitRequestId, queueFilters, { error: 'self-review' }));
    if (error?.code === 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED') return res.redirect(getReturnUrl(unitRequestId, queueFilters, { error: 'catalog-input' }));
    next(error);
  }
}

async function rejectUnitRequest(req, res, next) {
  try {
    const unitRequestId = getUnitRequestId(req);
    const queueFilters = getQueueFilters(req);
    if (!unitRequestId) return res.redirect(getReturnUrl(null, queueFilters));

    const request = await unitRequestModel.getUnitRequestById(unitRequestId);
    if (!request) return res.redirect(getReturnUrl(null, queueFilters));
    if (isCatalogRequest(request) && !canManageCatalogRequests(req)) {
      return res.redirect(getReturnUrl(unitRequestId, queueFilters, { error: 'catalog-permission' }));
    }

    const rejected = await unitRequestModel.rejectUnitRequest({
      unitRequestId,
      reviewedByUserId: req.currentUser.user_id,
      reviewerNote: req.body.reviewerNote
    });

    if (!rejected) return res.redirect(getReturnUrl(unitRequestId, queueFilters, { skipped: 'not-pending' }));
    return res.redirect(getReturnUrl(unitRequestId, queueFilters, { rejected: '1' }));
  } catch (error) {
    if (error?.code === 'BWT_UNIT_REQUEST_REJECTION_NOTE_REQUIRED') {
      return res.redirect(getReturnUrl(getUnitRequestId(req), getQueueFilters(req), { error: 'rejection-note-required' }));
    }
    next(error);
  }
}

module.exports = {
  isRegularTechRequester,
  isUnitRequestReviewer,
  canManageCatalogRequests,
  renderUnitRequestsPage,
  renderUnitRequestDetail,
  withdrawUnitRequest,
  approveUnitRequest,
  rejectUnitRequest
};
