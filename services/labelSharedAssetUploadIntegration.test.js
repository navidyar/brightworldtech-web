'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Shared Assets exposes one Management-only PNG/SVG upload workflow', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelLibraryController.js');
  const page = read('views/pages/management-label-library.ejs');
  const assetsSection = read('views/fragments/label-library-assets-section.ejs');

  assert.match(routes, /label-library\/assets\/upload\/modal/);
  assert.match(routes, /label-library\/assets\/upload'[\s\S]*parseLabelAssetUploadBody[\s\S]*uploadLabelAsset/);
  assert.match(routes, /requireRole\(managementRoles\)/);
  assert.match(controller, /prepareLabelAssetUpload/);
  assert.match(controller, /createOrReuseLabelAsset/);
  assert.match(assetsSection, />Upload Asset<\/a>/);
  assert.match(page, /label-library-assets\.js/);
});

test('upload modal supports picker, drag/drop, and clipboard with explicit format policy', () => {
  const modal = read('views/fragments/label-library-asset-upload-modal.ejs');
  const js = read('public/js/label-library-assets.js');

  assert.match(modal, /accept="\.png,\.svg,image\/png,image\/svg\+xml"/);
  assert.match(modal, /Drop PNG or SVG here/);
  assert.match(modal, /Ctrl\+V while this window is open/);
  assert.match(modal, /JPEG, GIF, WebP, BMP, PDF/);
  assert.match(js, /document\.addEventListener\('drop'/);
  assert.match(js, /document\.addEventListener\('paste'/);
  assert.match(js, /Clipboard images must be PNG/);
  assert.match(js, /Only PNG and SVG Label Assets are supported/);
});

test('asset validation sanitizes SVG and validates PNG by signature and Sharp metadata', () => {
  const policy = read('services/labelAssetUploadPolicy.js');
  assert.match(policy, /PNG_SIGNATURE/);
  assert.match(policy, /sanitizeSvgBuffer/);
  assert.match(policy, /<script/);
  assert.match(policy, /on\[a-z0-9:_-\]/);
  assert.match(policy, /external files or URLs/);
  assert.match(policy, /sharp\(buffer, \{ limitInputPixels/);
  assert.match(policy, /MAX_LABEL_ASSET_UPLOAD_BYTES = 5 \* 1024 \* 1024/);
});

test('storage persists reusable image source once and deduplicates by SHA-256', () => {
  const model = read('models/labelLibraryModel.js');
  const storage = read('services/labelAssetStorage.js');
  assert.match(model, /async function createOrReuseLabelAsset/);
  assert.match(model, /getLabelAssetBySha256\(storedAsset\.sha256/);
  assert.match(model, /shared_asset_uploaded/);
  assert.match(model, /shared_asset_reused/);
  assert.match(storage, /crypto\.createHash\('sha256'\)/);
  assert.match(storage, /'image\/png': '\.png'/);
  assert.match(storage, /'image\/svg\+xml': '\.svg'/);
});

test('Shared Asset section summary is derived from the rendered asset rows', () => {
  const controller = read('controllers/labelLibraryController.js');
  assert.match(controller, /function summarizeAssetRows\(assets\)/);
  assert.match(controller, /asset_count:\s*0/);
  assert.match(controller, /total_bytes:\s*0/);
  assert.match(controller, /image_bytes:\s*0/);
  assert.match(controller, /json_bytes:\s*0/);
});

