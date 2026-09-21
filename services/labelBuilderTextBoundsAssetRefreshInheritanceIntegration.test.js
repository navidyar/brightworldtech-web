'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Builder constrains text size to its region and previews the same shrink behavior as rendering', () => {
  const builder = read('public/js/label-builder.js');
  assert.match(builder, /function constrainTextFontSizeToRegion\(region\)/);
  assert.match(builder, /function getFittedTextFontSize\(region, text\)/);
  assert.match(builder, /fontSizeInput\.max = String\(Math\.max\(6, Math\.floor\(localTextBox\.height\)\)\)/);
  assert.match(builder, /safeText\.length \* fontSize \* 0\.59 > localBox\.width/);
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
