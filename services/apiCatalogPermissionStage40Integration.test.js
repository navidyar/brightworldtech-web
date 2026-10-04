'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Tool Catalog submit routes use effective permission and owner-only polling', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /catalog-requests\/model', requireApiAuth, requireUnitApiAccess, requireApiCatalogSubmit/);
  assert.match(routes, /catalog-requests\/processor', requireApiAuth, requireUnitApiAccess, requireApiCatalogSubmit/);
  assert.match(routes, /catalog-requests\/:requestId', requireApiAuth, requireUnitApiAccess, apiCatalogRequestController\.getStatus/);
  assert.match(read('services/apiCatalogRequest.js'), /Number\(request\.requestedByUserId \|\| 0\) !== safeUserId/);
  assert.match(read('controllers/apiCatalogRequestController.js'), /permissions: req\.apiPermissions/);
});

test('Tool Catalog submit middleware enforces the specific permission after Unit API access', () => {
  const { requireApiCatalogSubmit } = require('../middleware/apiCatalogRequestPermissionMiddleware');
  const req = { apiUser: { roles: ['admin'] }, apiPermissions: new Set(['tools.unit_api.use', 'catalog_requests.submit']) };
  let called = 0;
  const next = () => { called += 1; };
  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });
  requireApiCatalogSubmit(req, response(), next);
  assert.equal(called, 1);

  req.apiPermissions = new Set(['tools.unit_api.use']);
  const denied = response();
  requireApiCatalogSubmit(req, denied, next);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.error.code, 'CATALOG_REQUEST_ACCESS_DENIED');
  assert.equal(called, 1, 'Admin role does not bypass DENY');

  req.apiUser.roles = [];
  req.apiPermissions = new Set(['tools.unit_api.use', 'catalog_requests.submit']);
  requireApiCatalogSubmit(req, response(), next);
  assert.equal(called, 2, 'custom role with effective grants is allowed');
});
