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

test('Management keeps request-scoped Processor approval with mandatory Admin consultation for new canonical records', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const page = read('views/pages/unit-request-detail.ejs');

  assert.match(controller, /const CATALOG_MANAGER_ROLE_CODES = new Set\(\['admin', 'management'\]\)/);
  assert.match(controller, /approvedExistingProcessorModelId: req\.body\.approvedExistingProcessorModelId/);
  assert.match(controller, /confirmedProcessorNamingWithAdmin: req\.body\.confirmedProcessorNamingWithAdmin/);
  assert.match(controller, /reviewerIsAdmin: isAdminCatalogReviewer\(req\)/);
  assert.match(model, /if \(!reviewerIsAdmin && String\(confirmedProcessorNamingWithAdmin \|\| ''\) !== '1'\)/);
  assert.match(model, /Management must confirm a new canonical Processor name and metadata with an Admin before creating it/);
  assert.match(page, /Management Request Boundary/);
  assert.match(page, /Management may adjust and approve Processor values here only because this Processor request was initiated/);
  assert.match(page, /name="confirmedProcessorNamingWithAdmin"/);
  assert.match(page, /<% if \(isAdminCatalogReviewer\) \{ %>[\s\S]*?Open Processor Catalog/);
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
