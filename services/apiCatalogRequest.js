'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
const unitRequestModel = require('../models/unitRequestModel');
const catalogRequestAccessPolicy = require('./catalogRequestAccessPolicy');

class ApiCatalogRequestError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiCatalogRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function defaultRequesterNote(kind, toolSource) {
  const toolLabel = String(toolSource || 'Tool').trim() || 'Tool';
  return kind === 'processor'
    ? `${toolLabel} observed a Processor that is not available in the BWTDallas catalog.`
    : `${toolLabel} observed a Unit Model that is not available in the BWTDallas catalog.`;
}

function assertSubmitAccess(roleCodes) {
  if (!catalogRequestAccessPolicy.canSubmitCatalogRequest(roleCodes)) {
    throw new ApiCatalogRequestError(403, 'CATALOG_REQUEST_ACCESS_DENIED', 'This BWTDallas user cannot submit Model or Processor Catalog requests.');
  }
}

function serializeRequest(request) {
  const context = request?.catalogContext || {};
  const kind = context.kind || null;
  const approved = request?.status === 'approved';
  const canContinue = approved && (
    (kind === 'model' && Number(context.approvedUnitModelId || 0) > 0)
    || (kind === 'processor' && Number(context.approvedProcessorModelId || 0) > 0)
  );

  let message = 'Catalog request status is unavailable.';
  if (request?.status === 'pending') {
    message = `The ${kind === 'processor' ? 'Processor' : 'Model'} Catalog request is pending Admin approval.`;
  } else if (request?.status === 'approved') {
    message = canContinue
      ? `The ${kind === 'processor' ? 'Processor' : 'Model'} has been added to BWTDallas. Refresh Resolve + Preflight and continue.`
      : `The request was approved, but BWTDallas could not resolve the approved catalog value. Refresh Resolve + Preflight before continuing.`;
  } else if (request?.status === 'rejected') {
    message = `The ${kind === 'processor' ? 'Processor' : 'Model'} Catalog request was rejected. Do not continue with the unmapped value.`;
  } else if (request?.status === 'withdrawn') {
    message = 'The Catalog request was withdrawn.';
  }

  const requestId = Number(request?.unitRequestId || 0) || null;
  const nextAction = request?.status === 'pending'
    ? 'wait_for_approval'
    : request?.status === 'approved'
      ? 'rerun_resolve'
      : ['rejected', 'withdrawn'].includes(request?.status)
        ? 'stop'
        : null;

  return {
    request_id: requestId,
    request_type: request?.requestType || null,
    kind,
    status: request?.status || null,
    can_continue: canContinue,
    next_action: nextAction,
    status_endpoint: requestId ? `/api/v1/units/catalog-requests/${requestId}` : null,
    message,
    submitted_at: request?.submittedAt || null,
    reviewed_at: request?.reviewedAt || null,
    reviewer_note: request?.reviewerNote || '',
    requested: kind === 'model'
      ? {
          manufacturer_id: Number(context.manufacturerId || 0) || null,
          unit_category_config_value_id: Number(context.unitCategoryConfigValueId || 0) || null,
          model_name: context.requestedModelName || ''
        }
      : kind === 'processor'
        ? {
            unit_model_id: Number(context.unitModelId || 0) || null,
            processor_type: context.requestedProcessorType || '',
            processor_name: context.requestedProcessorName || '',
            processor_speed_ghz: context.requestedProcessorSpeedGhz || ''
          }
        : null,
    approved: kind === 'model'
      ? {
          unit_model_id: Number(context.approvedUnitModelId || 0) || null,
          model_name: context.approvedModelName || context.approvedUnitModelLabel || ''
        }
      : kind === 'processor'
        ? {
            processor_brand_id: Number(context.approvedProcessorBrandId || 0) || null,
            processor_model_id: Number(context.approvedProcessorModelId || 0) || null,
            processor_label: [context.approvedProcessorBrandName, context.approvedProcessorModelLabel].filter(Boolean).join(' ').trim(),
            processor_speed_ghz: context.approvedProcessorBaseSpeedGhz || ''
          }
        : null
  };
}

async function getOwnedRequest({ requestId, userId }) {
  const safeRequestId = normalizePositiveInteger(requestId);
  const safeUserId = normalizePositiveInteger(userId);
  if (!safeRequestId) throw new ApiCatalogRequestError(400, 'INVALID_CATALOG_REQUEST_ID', 'A valid Catalog request ID is required.');

  const request = await unitRequestModel.getUnitRequestById(safeRequestId);
  if (!request || !request.isCatalogRequest || Number(request.requestedByUserId || 0) !== safeUserId) {
    throw new ApiCatalogRequestError(404, 'CATALOG_REQUEST_NOT_FOUND', 'The requested Model or Processor Catalog request was not found for this technician.');
  }
  return request;
}

async function getStatus({ requestId, userId }) {
  return serializeRequest(await getOwnedRequest({ requestId, userId }));
}

async function statusFromExistingPending(error, userId) {
  const requestId = normalizePositiveInteger(error?.unitRequestId);
  if (error?.code !== 'BWT_CATALOG_REQUEST_ALREADY_PENDING' || !requestId) return null;
  const status = await getStatus({ requestId, userId });
  return { ...status, existing_request: true };
}

function mapModelInput(body = {}) {
  return {
    manufacturerId: body.manufacturer_id ?? body.manufacturerId,
    unitCategoryConfigValueId: body.unit_category_config_value_id ?? body.unitCategoryConfigValueId,
    requestedModelName: body.requested_model_name ?? body.requestedModelName ?? body.model_name ?? body.modelName
  };
}

function mapProcessorInput(body = {}) {
  return {
    unitModelId: body.unit_model_id ?? body.unitModelId,
    requestedProcessorType: body.requested_processor_type ?? body.requestedProcessorType ?? body.processor_type ?? body.processorType,
    requestedProcessorName: body.requested_processor_name ?? body.requestedProcessorName ?? body.processor_name ?? body.processorName,
    requestedProcessorSpeedGhz: body.requested_processor_speed_ghz ?? body.requestedProcessorSpeedGhz ?? body.processor_speed_ghz ?? body.processorSpeedGhz
  };
}

async function createModel({ body = {}, userId, roleCodes = [], toolSource }) {
  assertSubmitAccess(roleCodes);
  const input = mapModelInput(body);
  const requesterNote = normalizeText(body.requester_note ?? body.requesterNote) || defaultRequesterNote('model', toolSource);
  try {
    const result = await unitRequestModel.createModelCatalogRequest({
      requestedByUserId: userId,
      ...input,
      requesterNote
    });
    return { ...(await getStatus({ requestId: result.unitRequestId, userId })), existing_request: false };
  } catch (error) {
    const existing = await statusFromExistingPending(error, userId);
    if (existing) return existing;
    if (error?.code === 'BWT_CATALOG_REQUEST_ALREADY_ACTIVE') {
      return {
        request_id: null,
        request_type: unitRequestModel.MODEL_CATALOG_REQUEST_TYPE,
        kind: 'model',
        status: 'available',
        can_continue: true,
        next_action: 'rerun_resolve',
        status_endpoint: null,
        existing_request: false,
        message: 'That Unit Model is already active in BWTDallas. Refresh Resolve + Preflight and continue.'
      };
    }
    throw new ApiCatalogRequestError(422, error?.code || 'MODEL_CATALOG_REQUEST_FAILED', error?.message || 'The Model Catalog request could not be submitted.');
  }
}

async function createProcessor({ body = {}, userId, roleCodes = [], toolSource }) {
  assertSubmitAccess(roleCodes);
  const input = mapProcessorInput(body);
  const requesterNote = normalizeText(body.requester_note ?? body.requesterNote) || defaultRequesterNote('processor', toolSource);
  try {
    const result = await unitRequestModel.createProcessorCatalogRequest({
      requestedByUserId: userId,
      ...input,
      requesterNote
    });
    return { ...(await getStatus({ requestId: result.unitRequestId, userId })), existing_request: false };
  } catch (error) {
    const existing = await statusFromExistingPending(error, userId);
    if (existing) return existing;
    throw new ApiCatalogRequestError(422, error?.code || 'PROCESSOR_CATALOG_REQUEST_FAILED', error?.message || 'The Processor Catalog request could not be submitted.');
  }
}

module.exports = {
  ApiCatalogRequestError,
  serializeRequest,
  createModel,
  createProcessor,
  getStatus
};
