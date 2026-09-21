'use strict';

const apiCatalogRequest = require('../services/apiCatalogRequest');

function sendError(res, error) {
  return res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    }
  });
}

async function createModel(req, res, next) {
  try {
    const result = await apiCatalogRequest.createModel({
      body: req.body || {},
      userId: req.apiUser.user_id,
      roleCodes: req.apiUser.roles || [],
      toolSource: req.apiToolSource
    });
    return res.status(result.existing_request || result.status === 'available' ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof apiCatalogRequest.ApiCatalogRequestError) return sendError(res, error);
    return next(error);
  }
}

async function createProcessor(req, res, next) {
  try {
    const result = await apiCatalogRequest.createProcessor({
      body: req.body || {},
      userId: req.apiUser.user_id,
      roleCodes: req.apiUser.roles || [],
      toolSource: req.apiToolSource
    });
    return res.status(result.existing_request ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof apiCatalogRequest.ApiCatalogRequestError) return sendError(res, error);
    return next(error);
  }
}

async function getStatus(req, res, next) {
  try {
    const result = await apiCatalogRequest.getStatus({
      requestId: req.params.requestId,
      userId: req.apiUser.user_id
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof apiCatalogRequest.ApiCatalogRequestError) return sendError(res, error);
    return next(error);
  }
}

module.exports = {
  createModel,
  createProcessor,
  getStatus
};
