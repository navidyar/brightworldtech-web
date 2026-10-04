'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

function routeBlock(source, method, route) {
  const routeIndex = source.indexOf(`'${route}'`);
  const blockStart = source.lastIndexOf(`router.${method}(`, routeIndex);
  const blockEnd = source.indexOf(');', routeIndex) + 2;
  return source.slice(blockStart, blockEnd);
}

test('Lot browse and core actions use their view/create/edit/duplicate permissions', () => {
  const routes = read('routes/lots.js');
  const expectations = [
    ['get', '/management/lots', ['lots.view']],
    ['get', '/management/lots/:lotId', ['lots.view']],
    ['get', '/management/lots/new/modal', ['lots.view', 'lots.create']],
    ['get', '/management/lots/new', ['lots.view', 'lots.create']],
    ['post', '/management/lots', ['lots.view', 'lots.create']],
    ['get', '/management/lots/:lotId/edit/modal', ['lots.view', 'lots.edit']],
    ['post', '/management/lots/:lotId/edit/modal', ['lots.view', 'lots.edit']],
    ['get', '/management/lots/:lotId/duplicate/modal', ['lots.view', 'lots.duplicate']],
    ['post', '/management/lots/:lotId/duplicate', ['lots.view', 'lots.duplicate']],
    ['get', '/management/lots/:lotId/export/csv', ['lots.view', 'lots.export']],
    ['get', '/management/lots/:lotId/export/xlsx', ['lots.view', 'lots.export']]
  ];
  for (const [method, route, permissions] of expectations) {
    const block = routeBlock(routes, method, route);
    assert.ok(block.startsWith(`router.${method}(`), `${method} ${route}`);
    for (const key of permissions) assert.ok(block.includes(`requirePermission('${key}')`), `${route}: ${key}`);
    assert.ok(!block.includes('requireRole(lotManagementRoles)'), `${route} remains role-gated`);
  }
  const browser = read('views/pages/management-lots.ejs');
  const detail = read('views/pages/management-lot-detail.ejs');
  assert.ok(browser.includes("hasPermission('lots.create')"));
  assert.ok(browser.includes("hasPermission('lots.edit')"));
  assert.ok(detail.includes("hasPermission('lots.edit')"));
  assert.ok(detail.includes("hasPermission('lots.duplicate')"));
});
