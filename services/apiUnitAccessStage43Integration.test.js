'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('Unit Tool API guard resolves grants, denies role bypass, and forwards database errors', async () => {
  const originalLoad = Module._load;
  let permissions = new Set(['tools.unit_api.use']);
  let fail = false;
  Module._load = function stubPermissionModel(request, parent, isMain) {
    if (request === '../models/permissionModel') {
      return { getUserPermissionContext: async (userId) => {
        assert.equal(userId, 7);
        if (fail) throw new Error('database unavailable');
        return { effectivePermissions: permissions };
      } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('../middleware/apiUnitAccessMiddleware');
  delete require.cache[modulePath];
  let requireUnitApiAccess;
  try {
    ({ requireUnitApiAccess } = require('../middleware/apiUnitAccessMiddleware'));
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });
  const req = { apiUser: { user_id: 7, roles: [] } };
  let called = 0;
  let forwarded = null;
  const next = (error) => { called += 1; forwarded = error || null; };
  await requireUnitApiAccess(req, response(), next);
  assert.equal(called, 1);
  assert.equal(req.apiPermissions, permissions);

  req.apiUser.roles = ['admin'];
  permissions = new Set();
  const denied = response();
  await requireUnitApiAccess(req, denied, next);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.error.code, 'UNIT_API_ACCESS_DENIED');
  assert.equal(called, 1);

  fail = true;
  await requireUnitApiAccess(req, response(), next);
  assert.equal(called, 2);
  assert.match(forwarded.message, /database unavailable/);
});
