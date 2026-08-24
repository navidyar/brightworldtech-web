const EXISTING_UNIT_OVERRIDE_TYPE = 'existing_unit_override';
const OUTCOME_CONFIRMATION_TYPE = 'outcome_confirmation';
const QC_REVERSION_TYPE = 'qc_reversion';

const UNIFIED_REQUEST_TYPES = new Set([
  'all',
  EXISTING_UNIT_OVERRIDE_TYPE,
  OUTCOME_CONFIRMATION_TYPE,
  QC_REVERSION_TYPE,
  'intentional_duplicate',
  'model_catalog_addition',
  'processor_catalog_addition'
]);

function normalizeStatus(value) {
  const normalized = String(value || 'pending').trim().toLowerCase();
  return ['pending', 'approved', 'rejected', 'withdrawn', 'all', 'archived'].includes(normalized)
    ? normalized
    : 'pending';
}

function normalizeRequestType(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return UNIFIED_REQUEST_TYPES.has(normalized) ? normalized : 'all';
}

function mapOverrideStatus(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();
  if (normalized === 'denied') return 'rejected';
  if (normalized === 'cancelled') return 'withdrawn';
  return ['pending', 'approved'].includes(normalized) ? normalized : normalized;
}

function getStatusLabel(status) {
  const labels = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn'
  };
  return labels[status] || String(status || 'Unknown');
}

function getStatusClass(status) {
  if (status === 'approved') return 'good';
  if (status === 'rejected' || status === 'withdrawn') return 'bad';
  return 'warn';
}

function mapUnitRequest(request) {
  return {
    ...request,
    requestSource: 'unit_request',
    requestKey: `unit-${request.unitRequestId}`,
    displayRequestId: request.unitRequestId,
    detailUrl: `/unit-requests/${request.unitRequestId}`,
    withdrawUrl: `/unit-requests/${request.unitRequestId}/withdraw`,
    submittedAt: request.submittedAt || null,
    searchValues: [
      request.unitRequestId,
      request.requestTypeLabel,
      request.statusLabel,
      request.requestedByName,
      request.matchedUnitLabel,
      request.matchedUnitCurrentLotName,
      request.requestedDestinationLotName,
      request.createdUnitLabel,
      request.createdUnitLotName,
      request.serialSummary,
      request.matchedUnitSnapshot?.display?.serialSummary,
      request.listContextPrimary,
      request.listContextSecondary,
      request.catalogContext?.manufacturerName,
      request.catalogContext?.unitCategoryLabel,
      request.catalogContext?.requestedModelName,
      request.catalogContext?.unitModelName,
      request.catalogContext?.requestedProcessorType,
      request.catalogContext?.requestedProcessorName,
      request.qcReversionContext?.assetLabel,
      request.qcReversionContext?.decisionLabel,
      request.qcReversionContext?.qcCheckId,
      request.qcReversionContext?.qcReviewedByName,
      request.qcReversionContext?.qcReviewNotes
    ]
  };
}

function mapOverrideRequest(request) {
  const status = mapOverrideStatus(request.requestStatus);
  const isOutcomeConfirmation = request.requestType === OUTCOME_CONFIRMATION_TYPE;
  const requestType = isOutcomeConfirmation ? OUTCOME_CONFIRMATION_TYPE : EXISTING_UNIT_OVERRIDE_TYPE;
  const requestTypeLabel = isOutcomeConfirmation
    ? 'Outcome Confirmation'
    : request.isParkedTakeoverRequest
      ? 'Parked Unit Takeover'
      : request.isDuplicateIntakeLotMoveRequest
        ? 'Lot Move'
        : request.isDuplicateIntakeMoveRequest
          ? 'Move / Takeover Existing Unit'
          : 'Existing Unit Override';
  const listContextSecondary = isOutcomeConfirmation
    ? [request.lotName, request.outcomeConfirmationOutcomeLabel ? `Requested ${request.outcomeConfirmationOutcomeLabel}` : ''].filter(Boolean).join(' · ')
    : request.requestedDestinationLotName && request.requestedDestinationLotName !== 'No destination selected'
      ? `${request.lotName} → ${request.requestedDestinationLotName}`
      : request.lotName;

  return {
    requestSource: 'override',
    requestKey: `override-${request.unitOverrideRequestId}`,
    displayRequestId: request.unitOverrideRequestId,
    unitOverrideRequestId: request.unitOverrideRequestId,
    requestType,
    requestTypeLabel,
    status,
    statusLabel: getStatusLabel(status),
    statusClass: getStatusClass(status),
    isPending: status === 'pending',
    isArchived: false,
    archivedAt: null,
    requestedByUserId: request.requestedByUserId,
    requestedByName: request.requestedByName,
    reviewedByUserId: request.reviewedByUserId,
    reviewedByName: request.reviewedByName || '',
    requesterNote: request.requesterNote || '',
    reviewerNote: request.reviewNotes || '',
    submittedAt: request.createdAt || null,
    reviewedAt: request.reviewedAt || null,
    detailUrl: `/unit-requests/override/${request.unitOverrideRequestId}`,
    withdrawUrl: `/unit-requests/override/${request.unitOverrideRequestId}/withdraw`,
    matchedUnitId: request.unitId,
    matchedUnitLabel: request.unitLabel,
    matchedUnitCurrentLotName: request.lotName,
    requestedDestinationLotId: request.requestedDestinationLotId,
    requestedDestinationLotName: request.requestedDestinationLotName,
    listContextPrimary: request.unitLabel,
    listContextSecondary,
    serialSummary: '',
    catalogContext: null,
    searchValues: [
      request.unitOverrideRequestId,
      requestTypeLabel,
      getStatusLabel(status),
      request.requestedByName,
      request.unitLabel,
      request.lotName,
      request.requestedDestinationLotName,
      request.reason,
      request.requesterNote,
      request.outcomeConfirmationOutcomeLabel,
      request.reviewNotes,
      request.validationLabel,
      request.decisionLabel
    ],
    originalOverrideRequest: request
  };
}

function matchesStatus(request, statusFilter) {
  if (statusFilter === 'all') return !request.isArchived;
  if (statusFilter === 'archived') return request.isArchived;
  return request.status === statusFilter && !request.isArchived;
}

function combineRequestResults({ unitResult, overrideResult, statusFilter = 'pending', requestTypeFilter = 'all' }) {
  const normalizedStatus = normalizeStatus(statusFilter);
  const normalizedType = normalizeRequestType(requestTypeFilter);
  const unitRequests = unitResult?.supported === false
    ? []
    : (unitResult?.requests || []).map(mapUnitRequest);
  const overrideRequests = normalizedStatus === 'archived' || overrideResult?.supported === false
    ? []
    : (overrideResult?.requests || []).map(mapOverrideRequest);

  const requests = [...unitRequests, ...overrideRequests]
    .filter((request) => matchesStatus(request, normalizedStatus))
    .filter((request) => normalizedType === 'all' || request.requestType === normalizedType)
    .sort((left, right) => {
      const leftTime = new Date(left.submittedAt || 0).getTime();
      const rightTime = new Date(right.submittedAt || 0).getTime();
      if (rightTime !== leftTime) return rightTime - leftTime;
      return String(right.requestKey).localeCompare(String(left.requestKey));
    });

  const supported = unitResult?.supported !== false && overrideResult?.supported !== false;
  const messages = [unitResult?.supported === false ? unitResult.message : '', overrideResult?.supported === false ? overrideResult.message : '']
    .filter(Boolean);

  return {
    supported,
    message: messages.join(' '),
    requests,
    statusFilter: normalizedStatus,
    requestTypeFilter: normalizedType
  };
}

module.exports = {
  EXISTING_UNIT_OVERRIDE_TYPE,
  OUTCOME_CONFIRMATION_TYPE,
  QC_REVERSION_TYPE,
  combineRequestResults,
  mapOverrideRequest,
  mapOverrideStatus,
  normalizeRequestType,
  normalizeStatus
};
