'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Builder keeps configured text size static and wraps text inside resized regions', () => {
  const builder = read('public/js/label-builder.js');
  const css = read('public/css/features.css');
  const renderer = read('services/labelTemplateLayoutRenderer.js');
  const policy = read('services/labelBuilderLayoutPolicy.js');
  assert.doesNotMatch(builder, /constrainTextFontSizeToRegion|getFittedTextFontSize/);
  assert.match(builder, /previewFontSize = Math\.max\(1, Number\(region\.style\.fontSize/);
  assert.match(builder, /fontSizeInput\.max = '300'/);
  assert.match(builder, /text\.dataset\.builderRegionText = ''/);
  assert.match(css, /\.label-builder-region-text[\s\S]*white-space: pre-wrap;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(renderer, /function wrapTextLines\(value, box, style\)/);
  assert.match(renderer, /const effectiveStyle = allowShrink \? style : \{ \.\.\.style, overflow: 'wrap' \}/);
  assert.match(policy, /overflow: 'wrap'/);
});

test('Barcode human-readable text explicitly uses Liberation Sans with Arial fallback in Builder and renderer', () => {
  const builder = read('public/js/label-builder.js');
  const renderer = read('services/labelTemplateLayoutRenderer.js');
  assert.ok(builder.includes(`text.setAttribute('font-family', '"Liberation Sans", Arial, sans-serif')`));
  assert.match(renderer, /fontFamily: 'Liberation Sans'/);
});

test('asset upload returns authoritative Shared Assets markup and client installs it directly', () => {
  const controller = read('controllers/labelLibraryController.js');
  const client = read('public/js/label-library-assets.js');
  const page = read('views/pages/management-label-library.ejs');
  assert.match(controller, /ensureUploadedAssetInViewData\(await getAssetListViewData\(\), result\)/);
  assert.match(controller, /assetsHtml = await renderViewToHtml/);
  assert.match(controller, /assetsHtml,/);
  assert.match(client, /replaceAssetSection\(payload\.assetsHtml\)/);
  assert.match(client, /assetIsVisible\(payload\.assetId\)/);
  assert.match(page, /assets-authoritative-response/);
});

test('asset upload lets the user rename and classify the selected file immediately before upload', () => {
  const modal = read('views/fragments/label-library-asset-upload-modal.ejs');
  const dropzoneIndex = modal.indexOf('data-label-asset-dropzone');
  const nameIndex = modal.indexOf('name="assetName"');
  assert.ok(dropzoneIndex >= 0 && nameIndex > dropzoneIndex);
  assert.match(modal, /After choosing the file, change this name before uploading if needed\./);
});

test('Configure Labels explains how to exclude one inherited parent label without implying partial inheritance continues', () => {
  const modal = read('views/fragments/lot-label-templates-modal.ejs');
  assert.match(modal, /Need to exclude a parent label\?/);
  assert.match(modal, /Future parent label-set changes will not flow into this Lot/);
  assert.match(modal, />Inherited</);
});
