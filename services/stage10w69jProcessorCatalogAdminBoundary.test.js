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
    assert.match(block, /requireRole\(configRoles\)/, `${routePath} must require Admin configuration access`);
  }
});

test('Management no longer receives direct Processor Catalog navigation', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const nav = read('views/partials/configuration-nav.ejs');

  assert.doesNotMatch(sidebar, /!canAccessMenuArea\('admin'\)[\s\S]*?\/management\/config\/processors/);
  assert.match(nav, /label: 'Processor Catalog'[\s\S]*?allowed: isAdminConfigurationUser/);
  assert.doesNotMatch(nav, /isManagementConfigurationUser/);
});

test('Model and Processor Catalog request decisions are Admin-only while Management keeps inspection access', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const page = read('views/pages/unit-request-detail.ejs');
  const queue = read('views/pages/unit-requests.ejs');

  assert.match(controller, /const CATALOG_MANAGER_ROLE_CODES = new Set\(\['admin'\]\)/);
  assert.match(controller, /Only Admin can approve or reject Model and Processor Catalog requests/);
  assert.match(controller, /reviewerIsAdmin: isAdminCatalogReviewer\(req\)/);
  assert.doesNotMatch(controller, /confirmedProcessorNamingWithAdmin/);
  assert.match(model, /Only Admin can approve Model Catalog requests/);
  assert.match(model, /Only Admin can approve Processor Catalog requests/);
  assert.doesNotMatch(model, /Management must confirm a new canonical Processor name and metadata with an Admin/);
  assert.doesNotMatch(page, /Management Request Boundary/);
  assert.doesNotMatch(page, /name="confirmedProcessorNamingWithAdmin"/);
  assert.match(page, /Tech Leads and Management can inspect Model and Processor Catalog requests, but only Admin can approve or reject them/);
  assert.match(queue, /Model and Processor Catalog approvals are Admin-only/);
});

test('Admin retains the complete direct Processor Catalog CRUD surface', () => {
  const page = read('views/pages/management-processors.ejs');
  const routes = read('routes/config.js');

  assert.match(page, />Edit<\/a>/);
  assert.match(page, />Families<\/a>/);
  assert.match(page, />Models<\/a>/);
  assert.match(page, /Resolve Duplicate<\/a>/);
  assert.match(page, />Delete<\/a>/);
  assert.match(routes, /processors\/:processorModelId\/edit\/modal'[\s\S]*?requireRole\(configRoles\)/);
  assert.match(routes, /processors\/:processorModelId\/delete'[\s\S]*?requireRole\(configRoles\)/);
});
