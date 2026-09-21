'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('Label Library rows use the compact blue drag target and vertically centered blue-tinted records', () => {
  const page = read('views/pages/management-label-library.ejs');
  const css = read('public/css/management.css');
  assert.match(css, /\.label-library-order-handle[\s\S]*?min-height:\s*2\.25rem/);
  assert.match(css, /\.label-library-table-card tbody td[\s\S]*?vertical-align:\s*middle/);
  assert.match(css, /\.label-library-table-card tbody tr[\s\S]*?var\(--blue-soft\)/);
  assert.match(page, /label-library-template-description/);
  assert.match(css, /\.label-library-template-cell \.label-library-template-description[\s\S]*?color:\s*#315f91/);
});

test('Configure Labels keeps the normal print-set option compact and description emphasized', () => {
  const modal = read('views/fragments/lot-label-templates-modal.ejs');
  const css = read('public/css/lots.css');
  assert.match(modal, /lot-label-template-normal-print-option/);
  assert.match(modal, /lot-label-template-description/);
  assert.match(css, /grid-template-columns:\s*18px minmax\(0, 1fr\)/);
  assert.match(modal, /Include in<br \/>normal print set/);
  assert.match(css, /padding-left:\s*4px/);
  assert.match(css, /\.lot-label-template-description/);
});

test('Shared Asset upload uses success navigation while rename refreshes in place', () => {
  const page = read('views/pages/management-label-library.ejs');
  const partial = read('views/fragments/label-library-assets-section.ejs');
  const client = read('public/js/label-library-assets.js');
  const routes = read('routes/management.js');
  const controller = read('controllers/labelLibraryController.js');
  const model = read('models/labelLibraryModel.js');
  assert.match(page, /label-library-assets-section/);
  assert.match(page, /label-library-assets\.js\?v=20260918-assets-rename-refresh-cleanup/);
  assert.match(partial, /data-label-library-assets-section/);
  assert.match(partial, /assets\/<%= asset\.asset_id %>\/rename\/modal/);
  assert.match(partial, /Generated JSON/);
  assert.match(partial, /Logos/);
  assert.match(partial, /Images/);
  assert.match(client, /async function refreshAssetSection\(\)/);
  assert.match(client, /window\.location\.assign/);
  assert.doesNotMatch(client, /installUploadedAsset|buildAssetRow|assetIsVisible/);
  assert.match(client, /data-label-asset-rename-form/);
  assert.match(client, /assetKind/);
  assert.match(routes, /label-library\/assets\/fragment/);
  assert.match(routes, /assets\/:assetId\/rename\/modal/);
  assert.match(controller, /async function renderAssetListFragment/);
  assert.match(controller, /async function renameAsset/);
  assert.match(model, /async function updateLabelAssetMetadata/);
  assert.match(model, /shared_asset_reclassified/);
  assert.match(model, /async function renameLabelAsset/);
  assert.match(model, /shared_asset_renamed/);
});

test('configured Lot copy counts flow defensively through assignment and print descriptor data shapes', () => {
  const policy = read('services/labelTemplateInputPolicy.js');
  const printing = read('services/labelLibraryPrintingService.js');
  const controller = read('controllers/techController.js');
  assert.match(policy, /getIndexedInputValue/);
  assert.match(policy, /const directKey = `\$\{fieldName\}_\$\{key\}`/);
  assert.match(policy, /const literalKey = `\$\{fieldName\}\[\$\{key\}\]`/);
  assert.match(printing, /assignment\.defaultQuantity \?\? assignment\.default_quantity/);
  assert.match(controller, /buildDefaultSelections\(resolvedTemplateSet\.templates\)/);
  assert.match(controller, /quantity:\s*descriptor\.defaultQuantity/);
});
