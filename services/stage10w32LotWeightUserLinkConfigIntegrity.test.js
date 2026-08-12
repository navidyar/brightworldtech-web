const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_PASSWORD_LINK_EXPIRY_HOURS,
  MIN_PASSWORD_LINK_EXPIRY_HOURS,
  MAX_PASSWORD_LINK_EXPIRY_HOURS,
  parsePasswordLinkExpiryHours,
  normalizePasswordLinkExpiryHours
} = require('./passwordLinkExpiryPolicy');
const { isValidConfigValueCode } = require('./configValueCodePolicy');
const { MIN_LOT_PRODUCTION_WEIGHT, parseRequiredLotProductionWeight } = require('./lotProductionWeightPolicy');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('password setup/reset link policy defaults to one hour and caps requests at eight hours', () => {
  assert.equal(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS, 1);
  assert.equal(MIN_PASSWORD_LINK_EXPIRY_HOURS, 1);
  assert.equal(MAX_PASSWORD_LINK_EXPIRY_HOURS, 8);
  assert.equal(parsePasswordLinkExpiryHours('1'), 1);
  assert.equal(parsePasswordLinkExpiryHours('8'), 8);
  assert.equal(parsePasswordLinkExpiryHours('0'), null);
  assert.equal(parsePasswordLinkExpiryHours('9'), null);
  assert.equal(parsePasswordLinkExpiryHours('1.5'), null);
  assert.equal(normalizePasswordLinkExpiryHours('24'), 1);
});

test('Lot Type codes can be short without relaxing code length across unrelated configuration categories', () => {
  assert.equal(isValidConfigValueCode('a', { allowShort: true }), true);
  assert.equal(isValidConfigValueCode('ai', { allowShort: true }), true);
  assert.equal(isValidConfigValueCode('as_is', { allowShort: true }), true);
  assert.equal(isValidConfigValueCode('a-1', { allowShort: true }), true);
  assert.equal(isValidConfigValueCode('a_', { allowShort: true }), false);
  assert.equal(isValidConfigValueCode('-a', { allowShort: true }), false);
  assert.equal(isValidConfigValueCode('A', { allowShort: true }), false);
  assert.equal(isValidConfigValueCode('a b', { allowShort: true }), false);
  assert.equal(isValidConfigValueCode('a'), false);
  assert.equal(isValidConfigValueCode('ai'), false);
  assert.equal(isValidConfigValueCode('abc'), true);
});

test('Lot production weight is required at 0.10 or higher with no application maximum', () => {
  assert.equal(MIN_LOT_PRODUCTION_WEIGHT, 0.10);
  assert.equal(parseRequiredLotProductionWeight(''), null);
  assert.equal(parseRequiredLotProductionWeight('0'), null);
  assert.equal(parseRequiredLotProductionWeight('0.09'), null);
  assert.equal(parseRequiredLotProductionWeight('0.10'), 0.10);
  assert.equal(parseRequiredLotProductionWeight('1.25'), 1.25);
  assert.equal(parseRequiredLotProductionWeight('999999'), 999999);

  const lotForm = read('views/fragments/lot-form-modal.ejs');
  const lotController = read('controllers/lotController.js');
  const lotModel = read('models/lotModel.js');

  assert.ok(lotForm.includes('name="defaultProductionWeight"') && lotForm.includes('min="0.10"') && lotForm.includes('required />'));
  assert.doesNotMatch(lotForm, /name="defaultProductionWeight"[^>]*max=/);
  assert.match(lotController, /Lot production weight is required and must be at least/);
  assert.match(lotModel, /parseRequiredLotProductionWeight\(formData\.defaultProductionWeight\)/);
});

test('User Management configures setup/reset link expiration before generation and reports expiry state', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/managementController.js');
  const usersPage = read('views/pages/management-users.ejs');
  const newUserPage = read('views/pages/management-user-new.ejs');
  const modal = read('views/fragments/management-user-setup-link-modal.ejs');
  const linkPage = read('views/pages/management-setup-link.ejs');
  const linkStatusJs = read('public/js/password-link-status.js');
  const copyLinkJs = read('public/js/copy-link.js');
  const managementModel = read('models/managementModel.js');

  assert.match(routes, /\/management\/users\/:userId\/setup-link\/modal/);
  assert.match(controller, /parsePasswordLinkExpiryHours\(expiryHoursRaw\)/);
  assert.match(controller, /createSetupLinkForUser\(user, req\.currentUser\.user_id, expiryHours\)/);
  assert.match(usersPage, /setup-link\/modal\?returnPath=active/);
  assert.doesNotMatch(usersPage, /<form method="post" action="\/management\/users\/<%= user\.user_id %>\/setup-link">/);
  assert.match(modal, /name="expiryHours"/);
  assert.match(modal, /max="<%= safePolicy\.maxHours %>"/);
  assert.match(newUserPage, /name="setupLinkExpiryHours"/);
  assert.match(linkPage, /data-generated-link-expiry/);
  assert.match(copyLinkJs, /label\.textContent = 'Expired'/);
  assert.match(usersPage, /data-password-link-expires-at/);
  assert.match(linkStatusJs, /expired/);
  assert.match(managementModel, /latest_password_link_expires_at/);
});

test('security setting and generic config validation share the new eight-hour cap and short-code policy', () => {
  const configController = read('controllers/configController.js');
  const authModel = read('models/authModel.js');
  const configModal = read('views/fragments/config-value-form-modal.ejs');

  assert.match(configController, /allowShort:[\s\S]*?'lot_types'/);
  assert.match(configController, /Lot Type code must be 1 to 120 characters/);
  assert.match(configController, /Code must be 3 to 120 characters/);
  assert.match(authModel, /passwordLinkExpiryPolicy/);
  assert.ok(configModal.includes('name="value"') && configModal.includes('min="1" max="8"'));
});
