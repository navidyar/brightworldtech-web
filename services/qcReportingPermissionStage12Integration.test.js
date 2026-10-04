'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC Reporting route uses qc.reporting.view instead of legacy qcReporting feature gate', () => {
  const route = read('routes/management.js');
  const routeBlock = route.match(/router\.get\(\s*'\/management\/qc-reporting',[\s\S]*?\n\);/);
  assert.ok(routeBlock, 'QC Reporting route should exist');
  assert.match(routeBlock[0], /requirePermission\('qc\.reporting\.view'\)/);
  assert.doesNotMatch(routeBlock[0], /requireFeature\('qcReporting'\)/);
});

test('QC Reporting sidebar visibility is permission-aware and can expose the Admin section independently', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /canViewQcReporting[\s\S]*hasPermission\('qc\.reporting\.view'\)/);
  assert.match(sidebar, /showAdminSection[\s\S]*canViewQcReporting/);
  const qcLink = sidebar.match(/<% if \(canViewQcReporting\) \{ %>[\s\S]*?href="\/management\/qc-reporting"[\s\S]*?<% \} %>/);
  assert.ok(qcLink, 'QC Reporting navigation should be gated by qc.reporting.view');
});

test('legacy Admin compatibility still includes qc.reporting.view through the full permission catalog', () => {
  const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');
  assert.equal(LEGACY_ROLE_GRANTS.admin.includes('qc.reporting.view'), true);
  assert.equal(LEGACY_ROLE_GRANTS.management.includes('qc.reporting.view'), false);
});
