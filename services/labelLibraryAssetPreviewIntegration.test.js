'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Shared Assets table provides lazy visual cues and a preview action', () => {
  const fragment = read('views/fragments/label-library-assets-section.ejs');

  assert.match(fragment, /class="label-library-asset-thumbnail"/);
  assert.match(fragment, /loading="lazy"/);
  assert.match(fragment, /imagePreviewAssetKinds/);
  assert.match(fragment, />JSON<\/span>/);
  assert.match(fragment, /assets\/<%= asset\.asset_id %>\/preview\/modal/);
  assert.match(fragment, />Preview<\/a>/);
});

test('asset preview route is Management-only and controller supports images and JSON', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelLibraryController.js');

  assert.match(routes, /label-library\/assets\/:assetId\/preview\/modal/);
  assert.match(routes, /requireRole\(managementRoles\)[\s\S]*renderAssetPreviewModal/);
  assert.match(controller, /MAX_LABEL_ASSET_JSON_PREVIEW_BYTES = 256 \* 1024/);
  assert.match(controller, /previewKind = 'image'/);
  assert.match(controller, /previewKind = 'json'/);
  assert.match(controller, /JSON\.stringify\(JSON\.parse\(raw\), null, 2\)/);
  assert.match(controller, /render\('fragments\/label-library-asset-preview-modal'/);
});

test('asset preview modal contains a contained image viewer and readable JSON viewer', () => {
  const modal = read('views/fragments/label-library-asset-preview-modal.ejs');
  const css = read('public/css/app.css');

  assert.match(modal, /label-library-asset-preview-image-shell/);
  assert.match(modal, /label-library-asset-json-preview/);
  assert.match(modal, /SHA-256/);
  assert.match(css, /label-library-asset-preview-image-shell img[\s\S]*max-width: 100%/);
  assert.match(css, /label-library-asset-json-preview[\s\S]*overflow: auto/);
  assert.match(css, /label-library-asset-thumbnail img[\s\S]*object-fit: contain/);
});
