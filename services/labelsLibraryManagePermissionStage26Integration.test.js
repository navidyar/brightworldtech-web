'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function routeBlock(routes, method, routePath) {
  const marker = `router.${method}(\n  '${routePath}'`;
  const start = routes.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${method.toUpperCase()} ${routePath}`);
  const end = routes.indexOf('\n);', start);
  assert.notEqual(end, -1, `Could not delimit ${method.toUpperCase()} ${routePath}`);
  return routes.slice(start, end + 3);
}

test('template metadata and lifecycle operations require labels.library.manage and view', () => {
  const routes = read('routes/management.js');
  const paths = [
    ['get', '/management/label-library/templates/new/modal'],
    ['post', '/management/label-library/templates'],
    ['get', '/management/label-library/templates/:labelTemplateId/edit/modal'],
    ['post', '/management/label-library/templates/:labelTemplateId/edit/modal'],
    ['post', '/management/label-library/templates/:labelTemplateId/clone'],
    ['get', '/management/label-library/templates/:labelTemplateId/:action/modal'],
    ['post', '/management/label-library/templates/:labelTemplateId/:action'],
    ['post', '/management/label-library/templates/reorder']
  ];
  for (const [method, routePath] of paths) {
    const block = routeBlock(routes, method, routePath);
    assert.match(block, /requireAuth/);
    assert.match(block, /requirePermission\('labels\.library\.view'\)/);
    assert.match(block, /requirePermission\('labels\.library\.manage'\)/);
    assert.doesNotMatch(block, /requireRole\(managementRoles\)/);
  }
});

test('template write controls and drag handles use labels.library.manage', () => {
  const page = read('views/pages/management-label-library.ejs');
  assert.match(page, /const canManageTemplates = [^;]*hasPermission\('labels\.library\.manage'\)/);
  assert.match(page, /if \(canManageTemplates\)[\s\S]*?New Template/);
  assert.match(page, /canManageTemplates && canReorderTemplates/);
  assert.match(page, /if \(canManageTemplates\)[\s\S]*?\/edit\/modal[\s\S]*?Clone/);
  assert.match(page, /if \(canManageTemplates\)[\s\S]*?Activate[\s\S]*?Archive[\s\S]*?Delete/);
});
