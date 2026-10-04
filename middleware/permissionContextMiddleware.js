'use strict';

const permissionModel = require('../models/permissionModel');
const {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions
} = require('../services/permissionResolver');

function createEmptyPermissionContext() {
  return {
    roles: [],
    rolePermissionKeys: [],
    userOverrides: [],
    effectivePermissions: new Set()
  };
}

function publishPermissionContext(req, res, context) {
  const normalizedContext = context || createEmptyPermissionContext();
  const effectivePermissions = normalizedContext.effectivePermissions instanceof Set
    ? normalizedContext.effectivePermissions
    : new Set();

  req.permissionContext = {
    ...normalizedContext,
    effectivePermissions
  };
  req.currentPermissions = effectivePermissions;

  res.locals.currentPermissionContext = req.permissionContext;
  res.locals.currentPermissions = [...effectivePermissions].sort();
  res.locals.hasPermission = (permissionKey) => hasPermission(effectivePermissions, permissionKey);
  res.locals.hasAnyPermission = (permissionKeys) => hasAnyPermission(effectivePermissions, permissionKeys);
  res.locals.hasAllPermissions = (permissionKeys) => hasAllPermissions(effectivePermissions, permissionKeys);
}

async function loadPermissionContext(req, res, next) {
  publishPermissionContext(req, res, createEmptyPermissionContext());

  if (!req.currentUser) {
    return next();
  }

  try {
    const context = await permissionModel.getUserPermissionContext(req.currentUser.user_id);
    publishPermissionContext(req, res, context);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createEmptyPermissionContext,
  publishPermissionContext,
  loadPermissionContext
};
