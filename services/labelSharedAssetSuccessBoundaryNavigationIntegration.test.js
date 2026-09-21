'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Shared Asset upload navigates immediately from HTTP success without parsing success JSON', () => {
  const client = read('public/js/label-library-assets.js');
  const successIndex = client.indexOf('if (response.ok)');
  const assignIndex = client.indexOf('window.location.assign', successIndex);
  const jsonIndex = client.indexOf('response.json()', successIndex);
  assert.ok(successIndex >= 0, 'success boundary should be explicit');
  assert.ok(assignIndex > successIndex, 'successful upload should navigate');
  assert.ok(jsonIndex > assignIndex, 'success navigation must happen before any JSON parsing');
  assert.match(client, /response\.headers\.get\('Location'\)/);
});

test('Shared Asset upload response provides a cache-busted Location header to the asset section', () => {
  const controller = read('controllers/labelLibraryController.js');
  const page = read('views/pages/management-label-library.ejs');
  assert.match(controller, /const redirectUrl = `\/management\/label-library\?\$\{result\.created \? 'asset_uploaded' : 'asset_reused'\}=1&asset_id=\$\{Number\(asset\.asset_id\)\}&_assets=\$\{Date\.now\(\)\}#label-library-assets-section`/);
  assert.match(controller, /res\.set\('Location', redirectUrl\)/);
  assert.match(page, /assets-rename-refresh-cleanup/);
});


test('Shared Asset upload form cannot be hijacked by the sitewide GET-form navigation policy', () => {
  const modal = read('views/fragments/label-library-asset-upload-modal.ejs');
  const navigationPolicy = read('public/js/navigation-policy.js');
  assert.match(modal, /<form class="label-library-asset-upload-form" method="post" data-history-allow="true" data-label-asset-upload-form novalidate>/);
  assert.match(navigationPolicy, /if \(method !== 'get'\) return false;/);
});
