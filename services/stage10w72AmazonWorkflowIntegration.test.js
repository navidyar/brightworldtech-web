'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Amazon Unit Form fields and AZ identifier contract are registered', () => {
  const registry = read('config/unitFormFieldRegistry.js');
  const identities = read('config/configIdentityRegistry.js');

  for (const fieldKey of ['amazon_asset_tag', 'fnsku', 'asin', 'tracking_number', 'pallet_number', 'buyer_comments']) {
    assert.match(registry, new RegExp(`key: '${fieldKey}'|configurableField\\('${fieldKey}'`));
  }
  assert.match(registry, /CLEAR_WHEN_HIDDEN/);
  assert.match(identities, /IDENTIFIER_AMAZON_ASSET_TAG:\s*204/);
  assert.match(identities, /amazon_asset_tag/);
});

test('AZ tags use a global 8-digit sequence and destination-lot policy', () => {
  const amazonModel = read('models/unitAmazonModel.js');
  const productionCycle = read('models/productionCycleModel.js');
  const techUnitModel = read('models/techUnitModel.js');

  assert.match(amazonModel, /AMAZON_ASSET_TAG_DIGITS = 8/);
  assert.match(amazonModel, /amazon_asset_tag_sequence/);
  assert.match(amazonModel, /padStart\(AMAZON_ASSET_TAG_DIGITS, '0'\)/);
  assert.match(amazonModel, /bulkGenerateDirectLotAmazonAssetTags/);
  assert.match(productionCycle, /applyDestinationLotAmazonPolicy/);
  assert.match(techUnitModel, /source: 'tech_unit_create'/);
  assert.match(techUnitModel, /if \(!lotChanged\)[\s\S]*applyDestinationLotAmazonPolicy[\s\S]*source: 'tech_unit_edit'/);
});

test('Unit Browser search supports cross-domain OR and AND matching for all Units', () => {
  const model = read('models/techUnitModel.js');
  const controller = read('controllers/techController.js');
  const page = read('views/pages/tech-units.ejs');

  assert.match(model, /filters\.searchMode === 'all'/);
  assert.match(model, /searchMode === 'all' \? ' AND ' : ' OR '/);
  assert.match(model, /m\.name LIKE/);
  assert.match(model, /um\.model_name LIKE/);
  assert.match(model, /processor_family_members pfm_search/);
  assert.match(model, /ua_search\.fnsku LIKE/);
  assert.match(model, /ua_search\.asin LIKE/);
  assert.match(model, /ua_search\.tracking_number LIKE/);
  assert.match(model, /ua_search\.pallet_number LIKE/);
  assert.match(
    model,
    /ua_search\.buyer_comments LIKE \?[\s\S]*searchParams\.push\(\.\.\.Array\(5\)\.fill\(likeSearch\)\)/,
    'Amazon search must bind one parameter for each of its five LIKE placeholders.'
  );
  assert.match(controller, /searchMode:.*'all'.*'any'/s);
  assert.doesNotMatch(page, /<select name="searchMode">/);
  assert.match(page, /class="tech-filter-search-stack"[\s\S]*<textarea[\s\S]*class="tech-search-match-toggle"[\s\S]*class="tech-filter-grid/);
  assert.match(page, /class="tech-search-match-toggle"/);
  assert.match(page, /type="radio"[\s\S]*name="searchMode"[\s\S]*value="any"/);
  assert.match(page, /type="radio"[\s\S]*name="searchMode"[\s\S]*value="all"/);
  assert.match(page, /<span>Any<\/span>/);
  assert.match(page, /<span>All<\/span>/);
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(table, /if \(amazonAssetTagValue\)/);
  assert.doesNotMatch(table, /amazonAssetTagBrowserEnabled/);
});

test('Pallet filter is lot-profile aware and pallet history is preserved before clearing current value', () => {
  const controller = read('controllers/techController.js');
  const amazonModel = read('models/unitAmazonModel.js');
  const auditSnapshot = read('services/unitAuditSnapshot.js');

  assert.match(controller, /fieldsByKey\.get\('pallet_number'\)/);
  assert.match(controller, /filters\.palletNumber = ''/);
  assert.match(amazonModel, /Destination Lot does not expose Pallet Number/);
  assert.match(amazonModel, /eventType: 'amazon_pallet_cleared'/);
  assert.match(auditSnapshot, /'pallet_number', 'Pallet Number'/);
  assert.match(auditSnapshot, /'buyer_comments', 'Buyer Comments'/);
});

test('Management controls explicit direct-lot AZ backfill and Amazon fields are exportable', () => {
  const routes = read('routes/lots.js');
  const detailPage = read('views/pages/management-lot-detail.ejs');
  const exportContract = read('config/unitExportContract.js');

  assert.match(routes, /amazon-asset-tags\/generate/);
  assert.match(routes, /requireRole\(lotManagementRoles\)/);
  assert.match(detailPage, /Generate Missing AZ Tags/);
  for (const key of ['amazonAssetTag', 'fnsku', 'asin', 'trackingNumber', 'palletNumber', 'buyerComments']) {
    assert.match(exportContract, new RegExp(`key: '${key}'`));
  }
});

test('migration is additive and leaves existing lots/backfill untouched by default', () => {
  const migration = read('scripts/migrateAmazonWorkflow.js');
  assert.match(migration, /generate_amazon_asset_tag TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(migration, /CREATE TABLE unit_amazon_details/);
  assert.match(migration, /CREATE TABLE amazon_asset_tag_sequence/);
  assert.match(migration, /Existing Lots remain AZ-generation Off by default and existing Units were not backfilled/);
});

test('Unit form save preflight gives immediate one-click busy feedback', () => {
  const script = read('public/js/tech-unit-form.js');
  const page = read('views/pages/tech-units.ejs');

  assert.match(script, /setTechUnitSubmitPreflightBusy/);
  assert.match(script, /Creating Unit\.\.\./);
  assert.match(script, /Updating Unit\.\.\./);
  assert.match(script, /setTechUnitSubmitPreflightBusy\(form, submitter, true\)/);
  assert.match(script, /replayed = true;[\s\S]*replayTechUnitFormSubmit\(form, submitter\)/);
  assert.match(page, /\/js\/tech-unit-form\.js\?v=[^"]+/);
});

test('modal Create and Edit replay the validated HTMX submitter click exactly once', () => {
  const script = read('public/js/tech-unit-form.js');
  const form = read('views/fragments/tech-unit-form.ejs');

  assert.match(form, /<%= isEditMode \? 'Update Unit' : 'Create Unit' %>/);
  assert.match(form, /hx-post=\"\$\{formAction\}\"/);
  assert.match(script, /submitter && form\.hasAttribute\('hx-post'\) && typeof submitter\.click === 'function'/);
  assert.match(script, /submitter\.click\(\);/);
  assert.match(script, /queueMicrotask\(clearStaleReplayMarker\)/);
});


test('Create and Edit save preflight cannot be interrupted by blur/background Lot refreshes', () => {
  const script = read('public/js/tech-unit-form.js');

  assert.match(script, /const submitPreflight = Boolean\(options\.submitPreflight\);/);
  assert.match(script, /techUnitSubmitPreflightPending === 'true' && !submitPreflight/);
  assert.match(script, /refreshLotUnitFormProfile\(form, \{ background: true, force: true, submitPreflight: true \}\)/);
  assert.match(script, /refreshLotRequirementWorkflow\(form, \{ background: true, submitPreflight: true \}\)/);
  assert.match(
    script,
    /data-assignable-lot-combobox[\s\S]{0,900}techUnitSubmitPreflightPending === 'true'/,
    'Assignable Lot focusout resolution must not interrupt a pending save preflight.'
  );
  assert.match(
    script,
    /data-processor-combobox[\s\S]{0,900}techUnitSubmitPreflightPending === 'true'/,
    'Processor focusout resolution must not interrupt a pending save preflight.'
  );
  assert.match(
    script,
    /data-unit-model-combobox[\s\S]{0,900}techUnitSubmitPreflightPending === 'true'/,
    'Unit Model focusout resolution must not interrupt a pending save preflight.'
  );
});


test('Pallet Number filter uses a capped searchable select-style typeahead instead of an unbounded select', () => {
  const techUnitsPage = read('views/pages/tech-units.ejs');
  const techUnitsJs = read('public/js/tech-units.js');
  const techUnitsCss = read('public/css/tech-units-clean.css');
  const amazonModel = read('models/unitAmazonModel.js');
  const controller = read('controllers/techController.js');
  const routes = read('routes/management.js');

  assert.match(techUnitsPage, /data-tech-pallet-filter-input/);
  assert.match(techUnitsPage, /placeholder="All pallets"/);
  assert.doesNotMatch(techUnitsPage, /<select name="palletNumber"/);
  assert.match(techUnitsJs, /\/tech\/units\/pallet-options/);
  assert.match(techUnitsJs, /ArrowDown/);
  assert.match(techUnitsJs, /ArrowUp/);
  assert.match(techUnitsCss, /tech-pallet-filter-input/);
  assert.match(techUnitsCss, /background-image: url/);
  assert.match(amazonModel, /searchDirectLotPalletNumbers/);
  assert.match(amazonModel, /LIMIT \$\{safeLimit \+ 1\}/);
  assert.doesNotMatch(controller, /rawResult\.palletNumberOptions/);
  assert.match(routes, /'\/tech\/units\/pallet-options'/);
});


test('AZ bulk-generation modal uses the standard Lot modal form layout', () => {
  const modal = read('views/fragments/lot-amazon-asset-tag-bulk-modal.ejs');

  assert.match(modal, /modal-panel site-clean-modal lot-modal lot-amazon-asset-tag-bulk-modal/);
  assert.match(modal, /class="modal-body"[\s\S]*<form class="app-form app-form-clean"/);
  assert.match(modal, /<legend>Generation Scope<\/legend>/);
  assert.match(modal, /class="checkbox-card"[\s\S]*name="scope"[\s\S]*value="direct"/);
  assert.match(modal, /class="form-actions"[\s\S]*data-modal-close[\s\S]*type="submit"/);
  assert.doesNotMatch(modal, /<footer class="modal-actions">/);
});
