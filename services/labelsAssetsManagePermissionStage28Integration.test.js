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

test('asset upload rename and delete require labels.assets.manage with library view', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['get', '/management/label-library/assets/:assetId/rename/modal'],
    ['post', '/management/label-library/assets/:assetId/rename'],
    ['get', '/management/label-library/assets/:assetId/delete/modal'],
    ['post', '/management/label-library/assets/:assetId/delete'],
    ['get', '/management/label-library/assets/upload/modal'],
    ['post', '/management/label-library/assets/upload']
  ]) {
    const block = routeBlock(routes, method, routePath);
    assert.match(block, /requireAuth/);
    assert.match(block, /requirePermission\('labels\.library\.view'\)/);
    assert.match(block, /requirePermission\('labels\.assets\.manage'\)/);
    assert.doesNotMatch(block, /requireRole\(managementRoles\)/);
  }
  assert.match(routeBlock(routes, 'post', '/management/label-library/assets/upload'), /parseLabelAssetUploadBody/);
});

test('asset read routes remain available with labels.library.view alone', () => {
  const routes = read('routes/management.js');
  for (const routePath of [
    '/management/label-library/assets/fragment',
    '/management/label-library/assets/:assetId/preview/modal',
    '/management/label-library/assets/:assetId/file'
  ]) {
    const block = routeBlock(routes, 'get', routePath);
    assert.match(block, /requirePermission\('labels\.library\.view'\)/);
    assert.doesNotMatch(block, /labels\.assets\.manage/);
  }
  const assets = read('views/fragments/label-library-assets-section.ejs');
  assert.match(assets, /if \(canManageAssets\)[\s\S]*?Upload Asset/);
  assert.match(assets, /if \(canManageAssets && \['image\/png', 'image\/svg\+xml'\]/);
});
