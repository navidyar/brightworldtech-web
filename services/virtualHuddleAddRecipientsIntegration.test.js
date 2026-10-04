'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('adding recipients has a dedicated permission and protected routes', () => {
  const catalog = read('config/permissionCatalog.js');
  const bootstrap = read('config/legacyPermissionBootstrap.js');
  const routes = read('routes/virtualHuddle.js');
  assert.match(catalog, /huddle\.recipients\.add/);
  assert.match(catalog, /Add Huddle Recipients/);
  assert.match(bootstrap, /'huddle\.recipients\.add'/);
  assert.match(routes, /recipients\/add\/modal'[\s\S]*requirePermission\('huddle\.recipients\.add'\)/);
  assert.match(routes, /recipients\/add'[\s\S]*requirePermission\('huddle\.recipients\.add'\)/);
});

test('Huddle detail exposes Add Recipients and the modal excludes existing recipients through controller candidates', () => {
  const controller = read('controllers/virtualHuddleController.js');
  const page = read('views/pages/management-virtual-huddle-detail.ejs');
  const modal = read('views/fragments/virtual-huddle-detail-modal.ejs');
  const picker = read('views/fragments/virtual-huddle-add-recipients-modal.ejs');
  assert.match(controller, /canAddRecipients: hasPermission\(req, 'huddle\.recipients\.add'\)/);
  assert.match(controller, /existingUserIds/);
  assert.match(controller, /senderUserId/);
  assert.match(page, />Add Recipients<\/a>/);
  assert.match(modal, />Add Recipients<\/a>/);
  assert.match(picker, /Only active employees who are not already recipients are listed/);
  assert.match(picker, /Add Selected Recipients/);
});

test('new recipient delivery preserves original Huddle acknowledgment policy and prevents duplicate rows', () => {
  const model = read('models/virtualHuddleModel.js');
  assert.match(model, /async function addRecipients/);
  assert.match(model, /SELECT user_id[\s\S]*FROM virtual_huddle_recipients[\s\S]*FOR UPDATE/);
  assert.match(model, /existingUserIds/);
  assert.match(model, /huddlePolicy\.getAcknowledgmentMode/);
  assert.match(model, /senderRoleCodes: \[message\.sender_role_code_snapshot\]/);
  assert.match(model, /huddlePolicy\.getInitialRecipientState/);
  assert.match(model, /INSERT INTO virtual_huddle_targets/);
  assert.match(model, /INSERT INTO virtual_huddle_recipients/);
});
