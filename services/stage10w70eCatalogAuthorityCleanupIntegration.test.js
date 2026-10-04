'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Catalog approval requires Approve Processor Catalog Requests permission while preserving inspection access', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const detail = read('views/pages/unit-request-detail.ejs');
  const queue = read('views/pages/unit-requests.ejs');

  assert.match(read('services/requestPermissionScope.js'), /return hasPermission\(req, 'requests\.review'\)/);
  assert.match(read('services/requestPermissionScope.js'), /catalog_requests\.model\.review[\s\S]*catalog_requests\.processor\.review/);
  assert.match(controller, /isCatalogRequest\(request\) && !canManageCatalogRequests\(req, request\)/);
  assert.match(controller, /catalogReviewAuthorized: canManageCatalogRequests\(req, request\)/);
  assert.match(model, /CATALOG_REQUEST_TYPES\.has\(request\.request_type\) && !catalogReviewAuthorized/);
  assert.match(model, /The matching Model or Processor Catalog approval permission is required to reject this request/);
  assert.match(detail, /The matching Model or Processor Catalog approval permission is required to approve or reject it/);
  assert.match(queue, /Each request type has separate approval authority/);
});

test('Stage 10W70E allows Admin self-approval for both Model and Processor requests', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');

  assert.match(controller, /const canSelfReviewCatalogRequest = catalogManager && isCatalogRequest\(request\)/);
  assert.match(controller, /reviewerIsAdmin: isAdminCatalogReviewer\(req, request\)/);
  assert.match(model, /approveModelCatalogRequest\([\s\S]*reviewerIsAdmin = false/);
  assert.match(model, /approveProcessorCatalogRequest\([\s\S]*reviewerIsAdmin = false/);
  assert.match(model, /selfReviewedByAdmin: isSelfReview/);
});

test('Stage 10W70E removes the obsolete Management-with-Admin Processor approval exception', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const detail = read('views/pages/unit-request-detail.ejs');

  assert.doesNotMatch(controller, /confirmedProcessorNamingWithAdmin|processor-admin-confirmation/);
  assert.doesNotMatch(model, /confirmedProcessorNamingWithAdmin|BWT_CATALOG_PROCESSOR_ADMIN_CONFIRMATION_REQUIRED|Management must confirm a new canonical Processor/);
  assert.doesNotMatch(detail, /confirmedProcessorNamingWithAdmin|Management Request Boundary|I confirmed this new Processor name and metadata with an Admin/);
  assert.match(detail, /Processor Catalog Review/);
});


test('Stage 10W70E deployment preflight is read-only and catalog-scoped', () => {
  const preflight = read('scripts/preflight-stage-10w70e-catalog-authority.sh');
  assert.match(preflight, /model_catalog_addition/);
  assert.match(preflight, /processor_catalog_addition/);
  assert.match(preflight, /No database changes were made/);
  assert.doesNotMatch(preflight, /(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)/i);
});

test('Stage 10W70E leaves direct Model and Processor Configuration routes Admin-only', () => {
  const routes = read('routes/config.js');
  assert.match(routes, /router\.use\('\/management\/config', requireAuth, requirePermission\('configuration\.view'\)\)/);
  for (const routePath of ['/management/config/models', '/management/config/processors']) {
    const start = routes.indexOf(`'${routePath}'`);
    assert.notEqual(start, -1, `${routePath} route should exist`);
    const block = routes.slice(start, routes.indexOf(');', start) + 2);
    const permission = routePath.endsWith('/models') ? 'configuration.models.manage' : 'configuration.processors.manage';
    assert.ok(block.includes(`requirePermission('${permission}')`));
  }
});
