'use strict';

const permissionModel = require('../models/permissionModel');
const { canUseUnitApi } = require('../services/apiUnitAccess');

async function requireUnitApiAccess(req, res, next) {
  try {
    const context = await permissionModel.getUserPermissionContext(req.apiUser.user_id);
    req.apiPermissions = context?.effectivePermissions instanceof Set
      ? context.effectivePermissions
      : new Set();
    if (!canUseUnitApi(req.apiPermissions)) {
      return res.status(403).json({
        error: {
          code: 'UNIT_API_ACCESS_DENIED',
          message: 'This BWTDallas user is not permitted to use Unit tool workflows.'
        }
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireApiAnyPermission(permissionKeys) {
  const requiredKeys = (Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys])
    .map((key) => String(key || '').trim()).filter(Boolean);
  return (req, res, next) => {
    const permissions = req.apiPermissions instanceof Set ? req.apiPermissions : new Set();
    if (!requiredKeys.some((key) => permissions.has(key))) {
      return res.status(403).json({ error: { code: 'UNIT_PERMISSION_DENIED', message: `One of these permissions is required: ${requiredKeys.join(', ')}.` } });
    }
    return next();
  };
}

module.exports = { requireUnitApiAccess, requireApiAnyPermission };
