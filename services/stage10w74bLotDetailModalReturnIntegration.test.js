const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Lot Details marks edit, visibility, and closure modals to return to the same Lot', () => {
  const page = read('views/pages/management-lot-detail.ejs');

  for (const action of ['edit/modal', 'hide/modal', 'unhide/modal', 'close/modal', 'reopen/modal']) {
    assert.match(page, new RegExp(`/management/lots/<%= lot\\.lot_id %>/${action.replace('/', '\\/')}\\?returnTo=lot-detail`));
  }

  assert.match(page, /\/duplicate\/modal"/);
  assert.match(page, /\/delete\/modal"/);
});

test('Lot mutation modals preserve their validated return target through POST and error re-rendering', () => {
  const controller = read('controllers/lotController.js');
  const editModal = read('views/fragments/lot-form-modal.ejs');
  const visibilityModal = read('views/fragments/lot-visibility-modal.ejs');
  const closureModal = read('views/fragments/lot-closure-modal.ejs');

  assert.match(controller, /function getLotActionReturnTo\(req = \{\}\)[\s\S]*?=== 'lot-detail'[\s\S]*?'lot-browser';/);
  assert.match(controller, /function buildLotActionRedirect\(lotId, notice, browserRedirectUrl, returnTo = 'lot-browser'\)[\s\S]*?`\/management\/lots\/\$\{Number\(lotId\)\}\?\$\{notice\}`/);
  assert.match(controller, /renderEditLotModal[\s\S]*?const returnTo = getLotActionReturnTo\(req\);/);
  assert.match(controller, /updateLotModal[\s\S]*?buildLotActionRedirect\(lotId, 'updated=1', '\/management\/lots\?updated=1', returnTo\)/);
  assert.match(controller, /updateLotVisibility[\s\S]*?const notice = shouldUnhide \? 'unhidden=1' : 'hidden=1';[\s\S]*?buildLotActionRedirect\(lotId, notice, browserRedirectUrl, returnTo\)/);
  assert.match(controller, /updateLotClosure[\s\S]*?const notice = shouldReopen \? 'reopened=1' : 'closed=1';[\s\S]*?buildLotActionRedirect\(lotId, notice, browserRedirectUrl, returnTo\)/);

  for (const modal of [editModal, visibilityModal, closureModal]) {
    assert.match(modal, /name="returnTo" value="<%= safeReturnTo %>"/);
    assert.match(modal, /safeReturnTo = typeof returnTo !== 'undefined' && returnTo === 'lot-detail' \? 'lot-detail' : 'lot-browser'/);
  }
});

test('Lot Browser behavior remains the safe default while Lot Details can show all mutation success notices', () => {
  const controller = read('controllers/lotController.js');
  const browserPage = read('views/pages/management-lots.ejs');

  assert.match(controller, /return String\(req\?\.query\?\.returnTo \|\| req\?\.body\?\.returnTo \|\| ''\)\.trim\(\) === 'lot-detail'[\s\S]*?: 'lot-browser';/);
  assert.match(controller, /if \(query\.updated === '1'\) return 'Lot updated successfully\.';/);
  assert.match(controller, /if \(query\.hidden === '1'\) return 'Lot hidden successfully\.';/);
  assert.match(controller, /if \(query\.unhidden === '1'\) return 'Lot unhidden successfully\.';/);
  assert.match(controller, /if \(query\.closed === '1'\) return 'Lot closed successfully\.';/);
  assert.match(controller, /if \(query\.reopened === '1'\) return 'Lot reopened successfully\.';/);

  assert.doesNotMatch(browserPage, /returnTo=lot-detail/);
  assert.match(controller, /'\/management\/lots\?updated=1'/);
  assert.match(controller, /'\/management\/lots\?showHidden=1&unhidden=1'/);
  assert.match(controller, /'\/management\/lots\?hidden=1'/);
  assert.match(controller, /'\/management\/lots\?reopened=1'/);
  assert.match(controller, /'\/management\/lots\?closed=1'/);
});

test('existing Lot Details modal workflows that already return to Lot Details remain unchanged', () => {
  const controller = read('controllers/lotController.js');

  assert.match(controller, /`\/management\/lots\/\$\{lotId\}\?unitFormRulesUpdated=1`/);
  assert.match(controller, /`\/management\/lots\/\$\{lotId\}\?unitBrowserLayoutUpdated=1`/);
  assert.match(controller, /`\/management\/lots\/\$\{lotId\}\?unitBrowserLayoutReset=1`/);
  assert.match(controller, /`\/management\/lots\/\$\{lotId\}\?requirementCreated=1`/);
  assert.match(controller, /`\/management\/lots\/\$\{lotId\}\?requirementUpdated=1`/);
  assert.match(controller, /`\/management\/lots\/\$\{lotId\}\?requirementDeleted=1`/);
  assert.match(controller, /`\/management\/lots\/\$\{lotId\}\?amazonAssetTagsGenerated=\$\{result\.generatedCount\}`/);
  assert.match(controller, /`\/management\/lots\/\$\{result\.lotId\}\?duplicated=1`/);
  assert.match(controller, /'\/management\/lots\?deleted=1'/);
});
