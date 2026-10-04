'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('QC detail access and direct reversion use granular permission guards', () => {
  const routes = read('routes/management.js');
  const checks = [
    ['/tech/units/:unitId/qc-review/details/modal', 'units.view'],
    ['/tech/units/:unitId/qc-review/:qcCheckId/revert/modal', 'qc.reversion.perform'],
    ['/tech/units/:unitId/qc-review/:qcCheckId/revert', 'qc.reversion.perform']
  ];
  for (const [route, permission] of checks) {
    const block = routes.match(new RegExp(`router\\.(?:get|post)\\(\\s*'${route}'[\\s\\S]*?\\);`))?.[0];
    assert.ok(block, route);
    assert.match(block, new RegExp(`requirePermission\\('${permission.replaceAll('.', '\\.')}\\'\\)`));
    assert.doesNotMatch(block, /requireRole/);
  }
  const controller = read('controllers/techController.js');
  assert.match(controller, /function canDirectlyRevertQcReview\(req\) \{[\s\S]*?currentPermissions instanceof Set && req\.currentPermissions\.has\('qc\.reversion\.perform'\)/);
  assert.match(controller, /if \(!canDirectlyRevertQcReview\(req\)\) \{[\s\S]*?status\(403\)/);
  assert.match(controller, /const isQcRequester = canRequestQcReviewReversion\(req\)[\s\S]*?qcPortalRequestMode \|\| !canDirectlyRevertQcReview\(req\)/);
});
