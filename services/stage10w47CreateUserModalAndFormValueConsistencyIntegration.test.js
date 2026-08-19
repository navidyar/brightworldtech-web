const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Create User opens and validates inside the shared management modal while retaining full-page fallback', () => {
  const usersPage = read('views/pages/management-users.ejs');
  const controller = read('controllers/managementController.js');
  const modal = read('views/fragments/management-user-create-modal.ejs');

  assert.match(usersPage, /href="\/management\/users\/new"[^>]*hx-get="\/management\/users\/new"[^>]*hx-target="#modal-root"/);
  assert.match(controller, /isHtmxRequest\(req\) \? 'fragments\/management-user-create-modal' : 'pages\/management-user-new'/);
  assert.match(controller, /isHtmxRequest\(req\)[\s\S]*?'fragments\/management-user-created-modal'/);
  assert.match(modal, /hx-post="\/management\/users"/);
  assert.match(modal, /name="setupLinkExpiryHours"/);
  assert.match(modal, /class="modal-close-button"/);
});


test('Create User setup-link generation resolves the current initial setup link identity', () => {
  const controller = read('controllers/managementController.js');
  const authModel = read('models/authModel.js');

  assert.match(controller, /linkTypeCode = hasExistingPassword \? 'password_reset' : 'initial_password_setup'/);
  assert.match(authModel, /initial_password_setup:\s*SYSTEM_CONFIG_VALUE_IDS\.PASSWORD_LINK_SETUP/);
  assert.match(authModel, /const linkTypeId = await getSystemConfigValueId\(PASSWORD_LINK_SYSTEM_ID_BY_CODE\[linkTypeCode\], connection\)/);
});

test('Create User result modal reuses the existing setup-link controls', () => {
  const createdModal = read('views/fragments/management-user-created-modal.ejs');
  const usersPage = read('views/pages/management-users.ejs');

  assert.match(createdModal, /data-copy-button/);
  assert.match(createdModal, /data-generated-link-expiry/);
  assert.match(createdModal, /class="modal-close-button"/);
  assert.match(usersPage, /copy-link\.css/);
  assert.match(usersPage, /copy-link\.js/);
});

test('shared select and date values use one light typography contract without legacy descendant span pollution', () => {
  const appCss = read('public/css/app.css');
  const styleCss = read('public/css/style.css');
  const themeCss = read('public/css/theme.css');
  const techUnitsCss = read('public/css/tech-units-clean.css');
  const workAreaCss = read('public/css/work-area.css');

  assert.match(appCss, /--form-select-value-ink:\s*#40566e/);
  assert.match(appCss, /--form-select-value-font-size:\s*0\.86rem/);
  assert.match(appCss, /--form-select-value-font-weight:\s*400/);
  assert.match(appCss, /body select:not\(\[multiple\]\):not\(\[hidden\]\)[\s\S]*?font-weight:\s*var\(--form-select-value-font-weight\) !important/);
  assert.match(appCss, /data-site-date-picker-label[\s\S]*?data-tech-created-date-picker-label[\s\S]*?font:\s*inherit !important/);
  assert.doesNotMatch(styleCss, /\.form-field span\s*\{/);
  assert.doesNotMatch(themeCss, /\.form-field span\s*\{/);
  assert.doesNotMatch(techUnitsCss, /tech-filter-grid select:not\(\[multiple\]\),[\s\S]{0,180}font-weight:\s*600 !important/);
  assert.doesNotMatch(techUnitsCss, /tech-unit-form :is\([^}]*select:not\(\[multiple\]\)[^}]*font-weight:\s*var\(--form-field-value-font-weight/);
  assert.match(workAreaCss, /\.site-date-picker-trigger[\s\S]*?font-weight:\s*var\(--form-select-value-font-weight, 400\)/);
});
