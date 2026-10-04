'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function routeBlock(routes, routePath) {
  const marker = `router.get(\n  '${routePath}'`;
  const start = routes.indexOf(marker);
  assert.notEqual(start, -1, `Missing GET ${routePath}`);
  const end = routes.indexOf('\n);', start);
  assert.notEqual(end, -1, `Could not delimit GET ${routePath}`);
  return routes.slice(start, end + 3);
}

test('Label Library and its read-only detail routes use labels.library.view', () => {
  const routes = read('routes/management.js');
  for (const routePath of [
    '/management/label-library',
    '/management/label-library/templates/:labelTemplateId/lots/modal',
    '/management/label-library/assets/fragment',
    '/management/label-library/assets/:assetId/preview/modal',
    '/management/label-library/assets/:assetId/file'
  ]) {
    const block = routeBlock(routes, routePath);
    assert.match(block, /requireAuth/);
    assert.match(block, /requirePermission\('labels\.library\.view'\)/);
    assert.doesNotMatch(block, /requireRole\(managementRoles\)/);
  }
});

test('Label Library navigation appears from the view permission without exposing other Management links', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /const canViewLabelLibrary = [^;]*hasPermission\('labels\.library\.view'\)/);
  assert.match(sidebar, /canViewHuddleAdministration \|\| canViewLots \|\| canViewLabelLibrary/);
  assert.match(sidebar, /if \(canViewLabelLibrary\)[\s\S]*?href="\/management\/label-library"/);
  const start = sidebar.indexOf('<% if (canViewHuddleAdministration) { %>', sidebar.indexOf('<% if (canViewHuddleAdministration || canViewLots || canViewLabelLibrary) { %>'));
  const label = sidebar.indexOf('<% if (canViewLabelLibrary) { %>', start);
  assert.ok(start >= 0 && label > start);
  assert.match(sidebar.slice(start, label), /\/management\/virtual-huddle[\s\S]*?\/management\/lots/);
});

test('read-only Library viewers see data and only actions backed by their own permission', () => {
  const page = read('views/pages/management-label-library.ejs');
  const assets = read('views/fragments/label-library-assets-section.ejs');
  assert.match(page, /const canManageTemplates = [^;]*hasPermission\('labels\.library\.manage'\)/);
  assert.match(page, /const canManageBuilder = [^;]*hasPermission\('labels\.builder\.manage'\)/);
  assert.match(page, /const canPrintLabels = [^;]*hasPermission\('labels\.print'\)/);
  assert.match(page, /canManageTemplates && canReorderTemplates/);
  assert.match(page, /if \(canManageTemplates\)[\s\S]*?New Template/);
  assert.match(page, /if \(canManageBuilder && template\.status !== 'archived'\)[\s\S]*?Layout Builder/);
  assert.match(page, /if \(canPrintLabels && String\(template\.print_scope/);
  assert.match(assets, /const canManageAssets = [^;]*hasPermission\('labels\.assets\.manage'\)/);
  assert.match(assets, /if \(canManageAssets\)[\s\S]*?Upload Asset/);
  assert.match(assets, /if \(canManageAssets && \['image\/png', 'image\/svg\+xml'\]/);
  assert.match(assets, />Preview<\/a>/);
});
