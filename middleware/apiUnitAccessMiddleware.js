'use strict';

const { canUseUnitApi } = require('../services/apiUnitAccess');

function requireUnitApiAccess(req, res, next) {
  if (!canUseUnitApi(req.apiUser)) {
    return res.status(403).json({
      error: {
        code: 'UNIT_API_ACCESS_DENIED',
        message: 'This BWTDallas user is not permitted to use Unit tool workflows.'
      }
    });
  }

  return next();
}

module.exports = {
  requireUnitApiAccess
};
