'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('all direct Processor Catalog Configuration routes are Admin-only', () => {
  const routes = read('routes/config.js');
  const processorRouteBlocks = [
    '/management/config/processors',
    '/management/config/processors/:processorModelId/edit/modal',
    '/management/config/processors/:processorModelId/families/modal',
    '/management/config/processors/:processorModelId/families',
    '/management/config/processors/:processorModelId/models/modal',
    '/management/config/processors/:processorModelId/models',
    '/management/config/processors/:processorModelId/merge/modal',
    '/management/config/processors/:processorModelId/merge',
    '/management/config/processors/:processorModelId/delete/modal',
    '/management/config/processors/:processorModelId/delete'
  ];

  assert.doesNotMatch(routes, /processorCatalogRoles/);
  for (const routePath of processorRouteBlocks) {
    const start = routes.indexOf(`'${routePath}'`);
    assert.notEqual(start, -1, `${routePath} route should exist`);
    const block = routes.slice(start, routes.indexOf(');', start) + 2);
    assert.match(block, /requirePermission\('configuration\.processors\.manage'\)/, `${routePath} must require Processor Catalog management access`);
  }
});

test('Management no longer receives direct Processor Catalog navigation', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const nav = read('views/partials/configuration-nav.ejs');

  assert.doesNotMatch(sidebar, /!canAccessMenuArea\('admin'\)[\s\S]*?\/management\/config\/processors/);
  assert.match(nav, /label: 'Processor Catalog'[\s\S]*?allowed: canViewConfiguration && hasPermission\('configuration\.processors\.manage'\)/);
  assert.doesNotMatch(nav, /isManagementConfigurationUser/);
});

test('Model and Processor Catalog request decisions require type-specific approval permission', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const page = read('views/pages/unit-request-detail.ejs');
  const queue = read('views/pages/unit-requests.ejs');

  assert.match(controller, /return request \? canApproveCatalogRequest\(req, request\) : canApproveAnyCatalogRequests\(req\)/);
  assert.match(controller, /The matching Model or Processor Catalog approval permission is required to approve or reject this request/);
  assert.match(controller, /reviewerIsAdmin: isAdminCatalogReviewer\(req, request\)/);
  assert.doesNotMatch(controller, /confirmedProcessorNamingWithAdmin/);
  assert.match(model, /Approve Model Catalog Requests permission is required to approve Model Catalog requests/);
  assert.match(model, /Approve Processor Catalog Requests permission is required to approve Processor Catalog requests/);
  assert.doesNotMatch(model, /Management must confirm a new canonical Processor name and metadata with an Admin/);
  assert.doesNotMatch(page, /Management Request Boundary/);
  assert.doesNotMatch(page, /name="confirmedProcessorNamingWithAdmin"/);
  assert.match(page, /The matching Model or Processor Catalog approval permission is required to approve or reject it/);
  assert.match(queue, /Each request type has separate approval authority/);
});

test('Admin retains the complete direct Processor Catalog CRUD surface', () => {
  const page = read('views/pages/management-processors.ejs');
  const routes = read('routes/config.js');

  assert.match(page, />Edit<\/a>/);
  assert.match(page, />Families<\/a>/);
  assert.match(page, />Models<\/a>/);
  assert.match(page, /Resolve Duplicate<\/a>/);
  assert.match(page, />Delete<\/a>/);
  assert.match(routes, /processors\/:processorModelId\/edit\/modal'[\s\S]*?requirePermission\('configuration\.processors\.manage'\)/);
  assert.match(routes, /processors\/:processorModelId\/delete'[\s\S]*?requirePermission\('configuration\.processors\.manage'\)/);
});
