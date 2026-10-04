'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('QC reversion request modal and submission share effective permission guards', () => {
  const routes = read('routes/management.js');
  for (const route of [
    '/tech/units/:unitId/qc-review/:qcCheckId/reversion-request/modal',
    '/tech/units/:unitId/qc-review/:qcCheckId/reversion-request'
  ]) {
    const block = routes.match(new RegExp(`router\\.(?:get|post)\\(\\s*'${route}'[\\s\\S]*?\\);`))?.[0];
    assert.ok(block, route);
    assert.match(block, /requirePermission\('qc\.reversion\.request'\)/);
    assert.doesNotMatch(block, /requireRole/);
  }
  const controller = read('controllers/techController.js');
  assert.match(controller, /function canRequestQcReviewReversion\(req\) \{[\s\S]*?currentPermissions instanceof Set && req\.currentPermissions\.has\('qc\.reversion\.request'\)/);
  assert.match(controller, /if \(!canRequestQcReviewReversion\(req\)\) \{[\s\S]*?status\(403\)/);
  assert.match(controller, /const isQcRequester = canRequestQcReviewReversion\(req\)[\s\S]*?qcPortalRequestMode/);
});
