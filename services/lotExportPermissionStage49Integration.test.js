'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('Lot Unit export requires Lot view and lots.export, and its control follows lots.export', () => {
  const routes = read('routes/lots.js');
  const routeIndex = routes.indexOf("'/management/lots/:lotId/export/preview'");
  const blockStart = routes.lastIndexOf('router.get(', routeIndex);
  const blockEnd = routes.indexOf(');', routeIndex) + 2;
  const block = routes.slice(blockStart, blockEnd);
  assert.ok(block.includes("requirePermission('lots.view')"));
  assert.ok(block.includes("requirePermission('lots.export')"));
  assert.doesNotMatch(block, /requireRole\(lotManagementRoles\)/);
  assert.match(read('views/pages/management-lot-detail.ejs'), /hasPermission\('lots\.export'\)/);
});
