'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scope = require('./requestPermissionScope');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const request = (userId, permissions) => ({ currentUser: { user_id: userId }, currentPermissions: new Set(permissions) });

test('Requests view and each approval permission have separate read scopes', () => {
  const owner = request(4, []);
  const operational = request(5, ['requests.review']);
  const overrideReviewer = request(8, ['units.override.review']);
  const outcomeReviewer = request(9, ['units.outcome.approve']);
  const qcReviewer = request(10, ['qc.reversion.perform']);
  const catalog = request(6, ['catalog_requests.review']);
  const modelReviewer = request(7, ['catalog_requests.model.review']);
  const unit = { requestedByUserId: 4, isCatalogRequest: false };
  const catalogUnit = { requestedByUserId: 4, requestType: 'model_catalog_addition', isCatalogRequest: true };
  const processorCatalogUnit = { requestedByUserId: 4, requestType: 'processor_catalog_addition', isCatalogRequest: true };
  const override = { requestedByUserId: 4, requestType: 'manual_tech_override_request' };
  const outcome = { requestedByUserId: 4, requestType: 'outcome_confirmation' };
  const qcReversion = { requestedByUserId: 4, requestType: 'qc_reversion', isCatalogRequest: false };
  assert.equal(scope.canViewUnitRequest(owner, unit), true);
  assert.equal(scope.canViewUnitRequest(owner, catalogUnit), true);
  assert.equal(scope.canViewOverrideRequest(owner, override), true);
  assert.equal(scope.canViewUnitRequest(operational, unit), true);
  assert.equal(scope.canViewUnitRequest(operational, catalogUnit), false);
  assert.equal(scope.canViewOverrideRequest(operational, override), false);
  assert.equal(scope.canViewOverrideRequest(overrideReviewer, override), true);
  assert.equal(scope.canViewOverrideRequest(overrideReviewer, outcome), false);
  assert.equal(scope.canViewOverrideRequest(outcomeReviewer, outcome), true);
  assert.equal(scope.canViewOverrideRequest(outcomeReviewer, override), false);
  assert.equal(scope.canViewUnitRequest(qcReviewer, qcReversion), true);
  assert.equal(scope.canViewUnitRequest(operational, qcReversion), false);
  assert.equal(scope.canViewUnitRequest(catalog, catalogUnit), true);
  assert.equal(scope.canViewUnitRequest(catalog, unit), false);
  assert.equal(scope.canViewOverrideRequest(catalog, override), false);
  assert.equal(scope.canApproveCatalogRequests(catalog), false);
  assert.equal(scope.canApproveCatalogRequests(modelReviewer), true);
  assert.equal(scope.canViewUnitRequest(modelReviewer, catalogUnit), true);
  assert.equal(scope.canViewUnitRequest(modelReviewer, processorCatalogUnit), false);
  assert.equal(scope.canViewOverrideRequest(modelReviewer, override), false);
  assert.equal(scope.canViewUnitRequest(request(5, []), unit), false);
});

test('queue rows are filtered after shared queries and override query stays owner-scoped for catalog-only reviewers', () => {
  const controller = read('controllers/unitRequestController.js');
  assert.match(controller, /const requesterUserId = canReviewAnyUnitRequests\(req\) \? null : req\.currentUser\.user_id/);
  assert.match(controller, /const overrideRequesterUserId = canReviewAnyOverrideRequests\(req\) \? null : req\.currentUser\.user_id/);
  assert.match(controller, /result\.requests = result\.requests\.filter\(\(request\) => canViewQueueItem\(req, request\)\)/);
  const viewer = request(9, ['catalog_requests.review']);
  assert.equal(scope.canViewQueueItem(viewer, { requestSource: 'unit_request', requestedByUserId: 2, isCatalogRequest: true }), true);
  assert.equal(scope.canViewQueueItem(viewer, { requestSource: 'unit_request', requestedByUserId: 2, isCatalogRequest: false }), false);
  assert.equal(scope.canViewQueueItem(viewer, { requestSource: 'override', requestedByUserId: 2 }), false);
});

test('request queue and detail GETs use the shared view prerequisite without a role guard', () => {
  const routes = read('routes/management.js');
  assert.ok(routes.includes("router.use('/unit-requests', requireAuth, requirePermission('requests.view'))"));
  for (const route of ['/unit-requests', '/unit-requests/:unitRequestId', '/unit-requests/override/:overrideRequestId']) {
    const block = routes.split(`router.get(\n  '${route}',`)[1]?.split('\n);')[0] || '';
    assert.match(block, /requireAuth/);
    assert.doesNotMatch(block, /requireRole\(/);
  }
});
