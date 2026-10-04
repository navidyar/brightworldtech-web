'use strict';

function canRequestIntentionalDuplicate(req) {
  return req?.currentPermissions instanceof Set
    && req.currentPermissions.has('requests.submit');
}

module.exports = { canRequestIntentionalDuplicate };
