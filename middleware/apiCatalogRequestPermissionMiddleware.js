'use strict';

const { canSubmitCatalogRequestFromRequest } = require('../services/catalogRequestAccessPolicy');

function requireApiCatalogSubmit(req, res, next) {
  if (!canSubmitCatalogRequestFromRequest({ currentPermissions: req.apiPermissions })) {
    return res.status(403).json({
      error: {
        code: 'CATALOG_REQUEST_ACCESS_DENIED',
        message: 'This BWTDallas user cannot submit Model or Processor Catalog requests.'
      }
    });
  }
  return next();
}

module.exports = { requireApiCatalogSubmit };
