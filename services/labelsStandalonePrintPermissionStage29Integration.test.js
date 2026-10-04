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

test('Standalone Print modal and submission require labels.print with library read', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['get', '/management/label-library/templates/:labelTemplateId/print/modal'],
    ['post', '/management/label-library/templates/:labelTemplateId/print']
  ]) {
    const block = routeBlock(routes, method, routePath);
    assert.match(block, /requireAuth/);
    assert.match(block, /requirePermission\('labels\.library\.view'\)/);
    assert.match(block, /requirePermission\('labels\.print'\)/);
    assert.doesNotMatch(block, /requireRole\(managementRoles\)/);
  }
});

test('Standalone Print button follows labels.print and template readiness', () => {
  const page = read('views/pages/management-label-library.ejs');
  assert.match(page, /const canPrintLabels = [^;]*hasPermission\('labels\.print'\)/);
  assert.match(page, /if \(canPrintLabels && String\(template\.print_scope \|\| 'lot'\) === 'standalone' && template\.status === 'active' && Number\(template\.layout_ready \|\| 0\) === 1\)/);
});
