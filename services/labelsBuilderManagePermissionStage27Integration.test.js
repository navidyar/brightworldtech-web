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

test('Builder editor and preview operations use labels.builder.manage with library view', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['post', '/management/label-library/builder/qr-preview'],
    ['get', '/management/label-library/builder/units'],
    ['get', '/management/label-library/builder/units/:unitId'],
    ['get', '/management/label-library/templates/:labelTemplateId/builder'],
    ['post', '/management/label-library/templates/:labelTemplateId/builder']
  ]) {
    const block = routeBlock(routes, method, routePath);
    assert.match(block, /requireAuth/);
    assert.match(block, /requirePermission\('labels\.library\.view'\)/);
    assert.match(block, /requirePermission\('labels\.builder\.manage'\)/);
    assert.doesNotMatch(block, /requireRole\(managementRoles\)/);
  }
});

test('Builder Test Print needs labels.print and hides its control without that permission', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['get', '/management/label-library/templates/:labelTemplateId/builder/test-print/modal'],
    ['post', '/management/label-library/templates/:labelTemplateId/builder/test-print']
  ]) {
    const block = routeBlock(routes, method, routePath);
    for (const key of ['labels.library.view', 'labels.builder.manage', 'labels.print']) {
      assert.match(block, new RegExp(`requirePermission\\('${key.replaceAll('.', '\\.')}\'\\)`));
    }
    assert.doesNotMatch(block, /requireRole\(managementRoles\)/);
  }
  const page = read('views/pages/management-label-builder.ejs');
  assert.match(page, /if \(typeof hasPermission === 'function' && hasPermission\('labels\.print'\)\)[\s\S]*?data-builder-test-print/);
  const script = read('public/js/label-builder.js');
  assert.match(script, /if \(!testPrintButton\) return/);
});
