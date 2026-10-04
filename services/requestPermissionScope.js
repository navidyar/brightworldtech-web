'use strict';

const MODEL_CATALOG_REQUEST_TYPE = 'model_catalog_addition';
const PROCESSOR_CATALOG_REQUEST_TYPE = 'processor_catalog_addition';

function hasPermission(req, key) {
  return req?.currentPermissions instanceof Set && req.currentPermissions.has(key);
}

function canReviewOperationalRequests(req) {
  return hasPermission(req, 'requests.review');
}

function canReviewQcReversionRequests(req) {
  return hasPermission(req, 'qc.reversion.perform');
}

function canReviewOverrideRequests(req, request) {
  const key = request?.requestType === 'outcome_confirmation'
    ? 'units.outcome.approve'
    : 'units.override.review';
  return hasPermission(req, key);
}

function canReviewAnyOverrideRequests(req) {
  return hasPermission(req, 'units.override.review') || hasPermission(req, 'units.outcome.approve');
}

function getCatalogReviewPermissionKey(request) {
  if (request?.requestType === MODEL_CATALOG_REQUEST_TYPE) return 'catalog_requests.model.review';
  if (request?.requestType === PROCESSOR_CATALOG_REQUEST_TYPE) return 'catalog_requests.processor.review';
  return null;
}

function canReviewCatalogRequest(req, request) {
  const specificKey = getCatalogReviewPermissionKey(request);
  return hasPermission(req, 'catalog_requests.review') || Boolean(specificKey && hasPermission(req, specificKey));
}

function canApproveCatalogRequest(req, request) {
  const specificKey = getCatalogReviewPermissionKey(request);
  return Boolean(specificKey && hasPermission(req, specificKey));
}

function canReviewAnyCatalogRequests(req) {
  return hasPermission(req, 'catalog_requests.review')
    || hasPermission(req, 'catalog_requests.model.review')
    || hasPermission(req, 'catalog_requests.processor.review');
}

function canApproveAnyCatalogRequests(req) {
  return hasPermission(req, 'catalog_requests.model.review')
    || hasPermission(req, 'catalog_requests.processor.review');
}

// Backward-compatible helper names for callers/tests that only need any-catalog scope.
function canReviewCatalogRequests(req) { return canReviewAnyCatalogRequests(req); }
function canApproveCatalogRequests(req) { return canApproveAnyCatalogRequests(req); }

function canReviewAnyUnitRequests(req) {
  return canReviewOperationalRequests(req) || canReviewQcReversionRequests(req) || canReviewAnyCatalogRequests(req);
}

function canReviewAnyRequests(req) {
  return canReviewAnyUnitRequests(req) || canReviewAnyOverrideRequests(req);
}

function ownsRequest(req, request) {
  return Boolean(request && req?.currentUser && Number(request.requestedByUserId) === Number(req.currentUser.user_id));
}

function canViewUnitRequest(req, request) {
  if (!request) return false;
  if (ownsRequest(req, request)) return true;
  if (request.isCatalogRequest) return canReviewCatalogRequest(req, request);
  if (request.requestType === 'qc_reversion') return canReviewQcReversionRequests(req);
  return canReviewOperationalRequests(req);
}

function canViewOverrideRequest(req, request) {
  return Boolean(request) && (ownsRequest(req, request) || canReviewOverrideRequests(req, request));
}

function canApproveUnitRequest(req, request) {
  if (!request) return false;
  if (request.isCatalogRequest) return canApproveCatalogRequest(req, request);
  if (request.requestType === 'qc_reversion') return canReviewQcReversionRequests(req);
  return canReviewOperationalRequests(req);
}

function canApproveOverrideRequest(req, request) {
  return Boolean(request) && canReviewOverrideRequests(req, request);
}

function canViewQueueItem(req, request) {
  return request?.requestSource === 'override'
    ? canViewOverrideRequest(req, request)
    : canViewUnitRequest(req, request);
}

module.exports = {
  canReviewOperationalRequests,
  canReviewQcReversionRequests,
  canReviewOverrideRequests,
  canReviewAnyOverrideRequests,
  canReviewAnyUnitRequests,
  canReviewCatalogRequest,
  canApproveCatalogRequest,
  canReviewAnyCatalogRequests,
  canApproveAnyCatalogRequests,
  canReviewCatalogRequests,
  canApproveCatalogRequests,
  canReviewAnyRequests,
  canViewUnitRequest,
  canViewOverrideRequest,
  canApproveUnitRequest,
  canApproveOverrideRequest,
  canViewQueueItem
};
