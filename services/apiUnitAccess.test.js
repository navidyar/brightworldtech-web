'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canUseUnitApi } = require('./apiUnitAccess');
const { requireApiAnyPermission } = require('../middleware/apiUnitAccessMiddleware');

test('Unit API access follows effective tools.unit_api.use permission', () => {
  assert.equal(canUseUnitApi(new Set(['tools.unit_api.use'])), true);
  assert.equal(canUseUnitApi(new Set()), false);
  assert.equal(canUseUnitApi(null), false);
});


test('Unit Tool mutation guard requires a specific Unit permission and respects user DENY', () => {
  const requireEdit = requireApiAnyPermission('units.edit');
  const req = { apiPermissions: new Set(['tools.unit_api.use']) };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let calls = 0;
  requireEdit(req, res, () => { calls += 1; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'UNIT_PERMISSION_DENIED');
  assert.equal(calls, 0);
  req.apiPermissions = new Set(['tools.unit_api.use', 'units.edit']);
  requireEdit(req, res, () => { calls += 1; });
  assert.equal(calls, 1);
});
