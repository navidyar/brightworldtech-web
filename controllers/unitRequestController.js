const unitRequestModel = require('../models/unitRequestModel');
const overrideRequestModel = require('../models/overrideRequestModel');
const unifiedRequestQueue = require('../services/unifiedRequestQueue');

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
    requestTypeFilter: unifiedRequestQueue.normalizeRequestType(requestedRequestType || 'all'),
    searchTerm
  };
}

function getUnitRequestId(req) {
  const unitRequestId = Number(req.params.unitRequestId);
  return Number.isInteger(unitRequestId) && unitRequestId > 0 ? unitRequestId : null;
}

function getOverrideRequestId(req) {
  const overrideRequestId = Number(req.params.overrideRequestId);
  return Number.isInteger(overrideRequestId) && overrideRequestId > 0 ? overrideRequestId : null;
}

function getOverrideReturnUrl(overrideRequestId, queueFilters, query = {}) {
  const params = new URLSearchParams({ status: queueFilters?.statusFilter || 'pending' });
  if (queueFilters?.requestTypeFilter && queueFilters.requestTypeFilter !== 'all') params.set('requestType', queueFilters.requestTypeFilter);
  if (queueFilters?.searchTerm) params.set('search', queueFilters.searchTerm);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  return overrideRequestId
    ? `/unit-requests/override/${encodeURIComponent(overrideRequestId)}?${params.toString()}`
    : `/unit-requests?${params.toString()}`;
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
  if (query.withdrawn === '1') return 'Request withdrawn.';
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
  if (query.rejected === '1') return 'Request rejected.';
  if (query.skipped === 'not-pending') return 'That request was already reviewed or withdrawn.';
  return null;
}

function getErrorMessages(query) {
  if (query.error === 'rejection-note-required') return ['Enter a rejection note before rejecting this request.'];
  if (query.error === 'destination-invalid') return ['The originally requested destination lot is no longer open, visible, and assignable. Reject this request and have the Tech submit a new request with a current lot.'];
  if (query.error === 'self-review') return ['You cannot approve or reject your own request. Withdraw it instead if it is still pending.'];
  if (query.error === 'not-owner') return ['You can withdraw only your own pending requests.'];
  if (query.error === 'catalog-permission') return ['Only Management and Admin can approve or reject Catalog Exception requests.'];
  if (query.error === 'catalog-input') return ['Complete the canonical catalog values before approving this request.'];
  if (query.skipped === 'invalid-prior-credit') return ['Enter a prior-technician credit weight from 0.10 through 10.00.'];
  if (query.skipped === 'destination-lot-required') return ['Select an open destination Lot before approving this request.'];
  if (query.skipped === 'unit-parked') return ['Return the Unit to Active before approving this request.'];
  if (query.skipped === 'invalid-destination-lot') return ['The selected destination Lot is no longer open and assignable.'];
  if (query.skipped === 'destination-validation') {
    const detail = String(query.detail || '').trim().slice(0, 1000);
    return [detail || 'The Unit does not meet the selected destination Lot requirements.'];
  }
  if (query.error === 'destination-validation') {
    const detail = String(query.detail || '').trim().slice(0, 1000);
    return [detail || 'The saved Unit intake no longer meets the destination Lot requirements.'];
  }
  if (query.error === 'duplicate-identifier-storage') {
    return ['The Intentional Duplicate was not approved because its duplicate serial identifiers could not be stored. Apply the Stage 7D identifier-index correction, then approve a new pending request.'];
  }
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
    const [unitResult, overrideResult] = await Promise.all([
      unitRequestModel.listUnitRequests({
        statusFilter: queueFilters.statusFilter,
        requestTypeFilter: 'all',
        searchTerm: '',
        requestedByUserId: requesterUserId
      }),
      overrideRequestModel.listOverrideRequests({
        statusFilter: 'all',
        requestedByUserId: requesterUserId,
        limit: 250
      })
    ]);
    const result = unifiedRequestQueue.combineRequestResults({
      unitResult,
      overrideResult,
      statusFilter: queueFilters.statusFilter,
      requestTypeFilter: 'all'
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return res.render('pages/unit-requests', {
      pageTitle: 'Requests',
      currentNav: 'unit-requests',
      result,
      statusFilter: queueFilters.statusFilter,
      requestTypeFilter: queueFilters.requestTypeFilter,
      searchTerm: queueFilters.searchTerm,
      canReviewRequests: reviewer,
      canManageCatalogRequests: canManageCatalogRequests(req),
      isRegularTechRequester: isRegularTechRequester(req),
      currentUserId: req.currentUser.user_id,
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
    const canReviewThisRequest = isUnitRequestReviewer(req)
      && Number(request.requestedByUserId) !== Number(req.currentUser.user_id)
      && (!isCatalogRequest(request) || catalogManager);
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

async function renderOverrideRequestDetail(req, res, next) {
  try {
    const overrideRequestId = getOverrideRequestId(req);
    if (!overrideRequestId) {
      return res.status(404).render('pages/not-found', { pageTitle: 'Request Not Found', requestedPath: req.originalUrl });
    }

    const rawRequest = await overrideRequestModel.getOverrideRequestById(overrideRequestId);
    if (!rawRequest || (!isUnitRequestReviewer(req) && Number(rawRequest.requestedByUserId) !== Number(req.currentUser?.user_id))) {
      return res.status(404).render('pages/not-found', { pageTitle: 'Request Not Found', requestedPath: req.originalUrl });
    }
    const presentation = unifiedRequestQueue.mapOverrideRequest(rawRequest);
    const request = {
      ...rawRequest,
      statusLabel: presentation.statusLabel,
      statusClass: presentation.statusClass,
      isPending: presentation.isPending
    };

    const queueFilters = getQueueFilters(req);
    const assignableLots = await overrideRequestModel.listAssignableLots();
    return res.render('pages/override-request-detail', {
      pageTitle: `Request #${overrideRequestId}`,
      currentNav: 'unit-requests',
      request,
      assignableLots,
      statusFilter: queueFilters.statusFilter,
      requestTypeFilter: queueFilters.requestTypeFilter,
      searchTerm: queueFilters.searchTerm,
      requestQueueUrl: getOverrideReturnUrl(null, queueFilters),
      canReviewRequest: isUnitRequestReviewer(req) && Number(request.requestedByUserId) !== Number(req.currentUser?.user_id),
      canWithdrawRequest: request.isPending && Number(request.requestedByUserId) === Number(req.currentUser?.user_id),
      successMessage: req.query.approved === '1'
        ? 'Request approved.'
        : req.query.rejected === '1'
          ? 'Request rejected.'
          : req.query.withdrawn === '1'
            ? 'Request withdrawn.'
            : null,
      errorMessages: getErrorMessages(req.query)
    });
  } catch (error) {
    next(error);
  }
}

async function withdrawOverrideRequest(req, res, next) {
  const overrideRequestId = getOverrideRequestId(req);
  const queueFilters = getQueueFilters(req);
  try {
    if (!overrideRequestId) return res.redirect(getOverrideReturnUrl(null, queueFilters));
    await overrideRequestModel.withdrawOverrideRequest({
      overrideRequestId,
      requestedByUserId: req.currentUser.user_id,
      withdrawalNote: req.body.withdrawalNote
    });
    return res.redirect(getOverrideReturnUrl(overrideRequestId, queueFilters, { withdrawn: '1' }));
  } catch (error) {
    if (error?.code === 'BWT_OVERRIDE_REQUEST_NOT_OWNER') {
      return res.redirect(getOverrideReturnUrl(overrideRequestId, queueFilters, { error: 'not-owner' }));
    }
    if (error?.code === 'BWT_OVERRIDE_REQUEST_NOT_PENDING') {
      return res.redirect(getOverrideReturnUrl(overrideRequestId, queueFilters, { skipped: 'not-pending' }));
    }
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
    if (error?.code === 'BWT_INTENTIONAL_DUPLICATE_IDENTIFIER_STORAGE_BLOCKED') {
      return res.redirect(getReturnUrl(unitRequestId, queueFilters, { error: 'duplicate-identifier-storage' }));
    }
    if (error?.code === 'BWT_LOT_DESTINATION_VALIDATION_BLOCKED') {
      return res.redirect(getReturnUrl(unitRequestId, queueFilters, {
        error: 'destination-validation',
        detail: String(error.message || '').slice(0, 1000)
      }));
    }
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
  renderOverrideRequestDetail,
  withdrawUnitRequest,
  withdrawOverrideRequest,
  approveUnitRequest,
  rejectUnitRequest
};
