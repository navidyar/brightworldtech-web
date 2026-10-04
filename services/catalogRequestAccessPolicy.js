'use strict';

function canSubmitCatalogRequestFromRequest(req) {
  return req?.currentPermissions instanceof Set
    && req.currentPermissions.has('catalog_requests.submit');
}

module.exports = { canSubmitCatalogRequestFromRequest };
