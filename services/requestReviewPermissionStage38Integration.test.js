'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scope = require('./requestPermissionScope');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const actor = (...keys) => ({ currentUser: { user_id: 7 }, currentPermissions: new Set(keys) });

test('request approval authority follows the request type and effective permission', () => {
  const general = { requestType: 'intentional_duplicate', isCatalogRequest: false };
  const qc = { requestType: 'qc_reversion', isCatalogRequest: false };
  const catalog = { requestType: 'model_catalog_addition', isCatalogRequest: true };
  const override = { requestType: 'manual_tech_override_request' };
  const outcome = { requestType: 'outcome_confirmation' };
  assert.equal(scope.canApproveUnitRequest(actor('requests.review'), general), true);
  assert.equal(scope.canApproveUnitRequest(actor('requests.review'), qc), false);
  assert.equal(scope.canApproveUnitRequest(actor('qc.reversion.perform'), qc), true);
  assert.equal(scope.canApproveUnitRequest(actor('qc.reversion.perform'), general), false);
  assert.equal(scope.canApproveUnitRequest(actor('catalog_requests.review'), catalog), false);
  assert.equal(scope.canApproveUnitRequest(actor('catalog_requests.model.review'), catalog), true);
  assert.equal(scope.canApproveUnitRequest(actor('catalog_requests.processor.review'), catalog), false);
  assert.equal(scope.canApproveOverrideRequest(actor('units.override.review'), override), true);
  assert.equal(scope.canApproveOverrideRequest(actor('units.override.review'), outcome), false);
  assert.equal(scope.canApproveOverrideRequest(actor('units.outcome.approve'), outcome), true);
  assert.equal(scope.canApproveOverrideRequest(actor('units.outcome.approve'), override), false);
  assert.equal(scope.canApproveUnitRequest(actor(), general), false);
});

test('approve and reject routes have any-permission front doors and controllers check loaded type', () => {
  const routes = read('routes/management.js');
  const unitController = read('controllers/unitRequestController.js');
  const overrideController = read('controllers/overrideController.js');
  for (const suffix of ['approve', 'reject']) {
    const unit = routes.split(`router.post(\n  '/unit-requests/:unitRequestId/${suffix}',`)[1]?.split('\n);')[0] || '';
    assert.match(unit, /requireAnyPermission\(\['requests\.review', 'qc\.reversion\.perform', 'catalog_requests\.model\.review', 'catalog_requests\.processor\.review'\]\)/);
    const override = routes.split(`router.post(\n  '/unit-requests/override/:overrideRequestId/${suffix}',`)[1]?.split('\n);')[0] || '';
    assert.match(override, /requireAnyPermission\(\['units\.override\.review', 'units\.outcome\.approve'\]\)/);
  }
  assert.equal((unitController.match(/if \(!canApproveUnitRequest\(req, request\)\) return res\.sendStatus\(403\)/g) || []).length, 2);
  assert.equal((overrideController.match(/if \(!canApproveOverrideRequest\(req, request\)\) return res\.sendStatus\(403\)/g) || []).length, 2);
});

test('requesters can withdraw their own pending requests without a legacy role', () => {
  const routes = read('routes/management.js');
  for (const route of ['/unit-requests/:unitRequestId/withdraw', '/unit-requests/override/:overrideRequestId/withdraw']) {
    const block = routes.split(`router.post(\n  '${route}',`)[1]?.split('\n);')[0] || '';
    assert.match(block, /requireAuth/);
    assert.doesNotMatch(block, /requireRole\(/);
  }
  assert.match(read('controllers/unitRequestController.js'), /requestedByUserId: req\.currentUser\.user_id/);
  assert.match(read('views/pages/unit-request-detail.ejs'), /!canManageCatalogRequests && !canWithdrawRequest/);
});
