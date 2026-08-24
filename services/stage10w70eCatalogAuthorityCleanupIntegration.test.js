'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Stage 10W70E makes Model and Processor request approval/rejection Admin-only while preserving inspection access', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const detail = read('views/pages/unit-request-detail.ejs');
  const queue = read('views/pages/unit-requests.ejs');

  assert.match(controller, /REVIEW_ROLE_CODES = new Set\(\['admin', 'management', 'tech_lead'\]\)/);
  assert.match(controller, /CATALOG_MANAGER_ROLE_CODES = new Set\(\['admin'\]\)/);
  assert.match(controller, /isCatalogRequest\(request\) && !canManageCatalogRequests\(req\)/);
  assert.match(controller, /catalogReviewAuthorized: canManageCatalogRequests\(req\)/);
  assert.match(model, /CATALOG_REQUEST_TYPES\.has\(request\.request_type\) && !catalogReviewAuthorized/);
  assert.match(model, /Only Admin can reject Model and Processor Catalog requests/);
  assert.match(detail, /Tech Leads and Management can inspect Model and Processor Catalog requests, but only Admin can approve or reject them/);
  assert.match(queue, /Model and Processor Catalog approvals are Admin-only/);
});

test('Stage 10W70E allows Admin self-approval for both Model and Processor requests', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');

  assert.match(controller, /const canSelfReviewCatalogRequest = catalogManager && isCatalogRequest\(request\)/);
  assert.match(controller, /reviewerIsAdmin: isAdminCatalogReviewer\(req\)/);
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
  assert.match(detail, /Admin Catalog Review/);
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
  assert.match(routes, /const configRoles = \['admin'\]/);
  for (const routePath of ['/management/config/models', '/management/config/processors']) {
    const start = routes.indexOf(`'${routePath}'`);
    assert.notEqual(start, -1, `${routePath} route should exist`);
    const block = routes.slice(start, routes.indexOf(');', start) + 2);
    assert.match(block, /requireRole\(configRoles\)/);
  }
});
