'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const permissionModelPath = require.resolve('../models/permissionModel');
const permissionModel = {
  getUserPermissionContext: async () => {
    throw new Error('permission model stub was not configured');
  }
};

require.cache[permissionModelPath] = {
  id: permissionModelPath,
  filename: permissionModelPath,
  loaded: true,
  exports: permissionModel
};

const {
  loadPermissionContext,
  createEmptyPermissionContext,
  publishPermissionContext
} = require('../middleware/permissionContextMiddleware');

function createResponse() {
  return { locals: {} };
}

function runMiddleware(req, res) {
  return new Promise((resolve, reject) => {
    loadPermissionContext(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test('empty permission context is fail-closed and uses a Set for effective permissions', () => {
  const context = createEmptyPermissionContext();

  assert.deepEqual(context.roles, []);
  assert.deepEqual(context.rolePermissionKeys, []);
  assert.deepEqual(context.userOverrides, []);
  assert.ok(context.effectivePermissions instanceof Set);
  assert.equal(context.effectivePermissions.size, 0);
});

test('published permission context is available server-side and to views', () => {
  const req = {};
  const res = createResponse();
  const context = {
    roles: [{ role_id: 2, code: 'tech', name: 'Tech' }],
    rolePermissionKeys: ['units.view'],
    userOverrides: [{ permission_key: 'reports.export', effect: 'allow' }],
    effectivePermissions: new Set(['units.view', 'reports.export'])
  };

  publishPermissionContext(req, res, context);

  assert.equal(req.permissionContext, res.locals.currentPermissionContext);
  assert.equal(req.currentPermissions, context.effectivePermissions);
  assert.deepEqual(res.locals.currentPermissions, ['reports.export', 'units.view']);
  assert.equal(res.locals.hasPermission('units.view'), true);
  assert.equal(res.locals.hasPermission('units.delete'), false);
  assert.equal(res.locals.hasAnyPermission(['units.delete', 'reports.export']), true);
  assert.equal(res.locals.hasAllPermissions(['units.view', 'reports.export']), true);
});

test('unauthenticated requests receive an empty permission context without querying the database', async () => {
  const original = permissionModel.getUserPermissionContext;
  let queried = false;
  permissionModel.getUserPermissionContext = async () => {
    queried = true;
    throw new Error('should not query');
  };

  try {
    const req = {};
    const res = createResponse();
    await runMiddleware(req, res);

    assert.equal(queried, false);
    assert.ok(req.currentPermissions instanceof Set);
    assert.equal(req.currentPermissions.size, 0);
    assert.deepEqual(res.locals.currentPermissions, []);
    assert.equal(res.locals.hasPermission('units.view'), false);
  } finally {
    permissionModel.getUserPermissionContext = original;
  }
});

test('authenticated requests load effective permissions for the current user', async () => {
  const original = permissionModel.getUserPermissionContext;
  let requestedUserId = null;
  permissionModel.getUserPermissionContext = async (userId) => {
    requestedUserId = userId;
    return {
      roles: [{ role_id: 3, code: 'qc', name: 'Quality Control' }],
      rolePermissionKeys: ['qc.portal.view', 'units.view'],
      userOverrides: [{ permission_key: 'reports.export', effect: 'allow' }],
      effectivePermissions: new Set(['qc.portal.view', 'units.view', 'reports.export'])
    };
  };

  try {
    const req = { currentUser: { user_id: 42, roles: ['qc'] } };
    const res = createResponse();
    await runMiddleware(req, res);

    assert.equal(requestedUserId, 42);
    assert.equal(req.currentPermissions.has('qc.portal.view'), true);
    assert.equal(req.currentPermissions.has('reports.export'), true);
    assert.equal(res.locals.hasPermission('qc.portal.view'), true);
  } finally {
    permissionModel.getUserPermissionContext = original;
  }
});

test('permission context load errors are forwarded instead of silently granting access', async () => {
  const original = permissionModel.getUserPermissionContext;
  const expected = new Error('permission database unavailable');
  permissionModel.getUserPermissionContext = async () => {
    throw expected;
  };

  try {
    const req = { currentUser: { user_id: 42 } };
    const res = createResponse();

    await assert.rejects(runMiddleware(req, res), expected);
    assert.ok(req.currentPermissions instanceof Set);
    assert.equal(req.currentPermissions.size, 0);
  } finally {
    permissionModel.getUserPermissionContext = original;
  }
});
