'use strict';

function canUseUnitApi(permissions) {
  return permissions instanceof Set && permissions.has('tools.unit_api.use');
}

module.exports = { canUseUnitApi };
