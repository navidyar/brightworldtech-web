'use strict';

const apiUnitIntake = require('../services/apiUnitIntake');
const apiUnitCommit = require('../services/apiUnitCommit');
const apiUnitAction = require('../services/apiUnitAction');
const apiWipeCertificate = require('../services/apiWipeCertificate');

function sendIntakeError(res, error) {
  return res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    }
  });
}

async function resolveUnit(req, res, next) {
  try {
    const result = await apiUnitIntake.resolveUnit(req.body || {}, {
      preflightContext: {
        userId: req.apiUser.user_id,
        roleCodes: req.apiUser.roles || [],
        toolSource: req.apiToolSource
      }
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof apiUnitIntake.ApiUnitIntakeError) {
      return sendIntakeError(res, error);
    }
    return next(error);
  }
}

async function commitUnit(req, res, next) {
  try {
    const result = await apiUnitCommit.commitUnit({
      body: req.body || {},
      userId: req.apiUser.user_id,
      roleCodes: req.apiUser.roles || [],
      toolSource: req.apiToolSource
    });
    return res.status(result.replayed ? 200 : (result.status === 'CREATED' ? 201 : 200)).json(result);
  } catch (error) {
    if (error instanceof apiUnitCommit.ApiUnitCommitError) {
      return sendIntakeError(res, error);
    }
    return next(error);
  }
}


async function applyUnitAction(req, res, next) {
  try {
    const result = await apiUnitAction.applyUnitAction({
      body: req.body || {},
      userId: req.apiUser.user_id,
      roleCodes: req.apiUser.roles || [],
      toolSource: req.apiToolSource
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof apiUnitAction.ApiUnitActionError) {
      return sendIntakeError(res, error);
    }
    return next(error);
  }
}

async function recordWipeCertificate(req, res, next) {
  try {
    const result = await apiWipeCertificate.recordWipeCertificate({
      unitId: req.params.unitId,
      certificateId: req.params.certificateId,
      body: req.body || {},
      userId: req.apiUser.user_id,
      toolSource: req.apiToolSource
    });
    return res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof apiWipeCertificate.ApiWipeCertificateError) {
      return sendIntakeError(res, error);
    }
    return next(error);
  }
}

async function listCreationOptions(req, res, next) {
  try {
    const options = await apiUnitIntake.listCreationOptions();
    return res.status(200).json(options);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  resolveUnit,
  listCreationOptions,
  commitUnit,
  applyUnitAction,
  recordWipeCertificate
};
