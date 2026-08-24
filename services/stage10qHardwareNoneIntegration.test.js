'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Hardware Issue options identify semantic None values from configuration', () => {
  const model = read('models/unitIssueEntryModel.js');

  assert.match(model, /function isNoHardwareIssueOption\(option\)/);
  assert.match(model, /SYSTEM_CONFIG_VALUE_IDS\.HARDWARE_ISSUE_NONE/);
  assert.match(model, /hardwareIssueTypes\.map\(\(option\) => \(\{[\s\S]*?isNoIssue:\s*isNoHardwareIssueOption\(option\)/);
  assert.match(model, /isNoHardwareIssueOption,/);
});

test('Stage 10Q migration adds or reactivates an explicit Hardware None option', () => {
  const sql = read('sql/2026-08-stage-10q-hardware-none-option.sql');
  const applyScript = read('scripts/apply-stage-10q-hardware-none-option.sh');

  assert.match(sql, /hardware_issue_types/);
  assert.match(sql, /'hardware_issue_none'/);
  assert.match(sql, /'None'/);
  assert.match(sql, /'no_hardware_issue'/);
  assert.match(sql, /UPDATE config_values[\s\S]*?is_active = 1/);
  assert.match(sql, /INSERT INTO config_values/);
  assert.match(applyScript, /Stage 10Q Hardware Issue None option verified complete/);
});

test('Hardware None disables and clears custom issue and location in the browser', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const client = read('public/js/tech-unit-form.js');
  const css = read('public/css/tech-units-clean.css');

  assert.match(markup, /data-hardware-issue-type-select/);
  assert.match(markup, /data-hardware-no-issue-flag/);
  assert.match(markup, /data-hardware-detail-field/);
  assert.match(markup, /data-no-issue="<%= issueType\.isNoIssue \? 'true' : 'false' %>"/);
  assert.match(client, /function syncHardwareIssueRowState\(row\)/);
  assert.match(client, /row\.setAttribute\('data-hardware-no-issue', isNoIssue \? 'true' : 'false'\)/);
  assert.match(client, /data-hardware-detail-field[\s\S]*?control\.value = ''[\s\S]*?control\.disabled = isNoIssue/);
  assert.match(client, /syncAllHardwareIssueRows\(form\)/);
  assert.match(css, /tech-form-section--hardware-issues \[data-hardware-detail-field\]\[data-no-issue-disabled="true"\]/);
});

test('Server derives Hardware None from trusted configuration metadata', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /function getNoHardwareIssueTypeIdSet\(formOptions = \{\}\)/);
  assert.match(controller, /function normalizeHardwareIssueRowsForSubmission\(formData, formOptions = \{\}\)/);
  assert.match(controller, /issueRow\.isNoIssue = isNoIssue \? '1' : ''/);
  assert.match(controller, /if \(isNoIssue\) \{[\s\S]*?customIssueLabel = ''[\s\S]*?locationConfigValueId = ''/);
  assert.match(controller, /normalizeCosmeticIssueRowsForSubmission\(formData, formOptions\);\s*normalizeHardwareIssueRowsForSubmission\(formData, formOptions\);/);
  assert.match(controller, /if \(!isNoIssue && !issueRow\.issueTypeConfigValueId && !issueRow\.customIssueLabel\)/);
});

test('Lot-required Hardware Issues accept explicit None and use user-facing guidance', () => {
  const policy = read('services/unitFormSubmissionPolicy.js');
  const client = read('public/js/tech-unit-form.js');
  const markup = read('views/fragments/tech-unit-form.ejs');

  assert.match(policy, /normalizeText\(row\.isNoIssue\) === '1'/);
  assert.match(policy, /choose None when there is no hardware issue/i);
  assert.match(client, /choose None when there is no hardware issue/i);
  assert.match(markup, /Choose None when the unit has no hardware issue/);
});

test('Stage 10Q assets are cache-busted on all Unit form entry points', () => {
  const detailPage = read('views/pages/tech-unit-detail.ejs');
  const formPage = read('views/pages/tech-unit-form.ejs');
  const browserPage = read('views/pages/tech-units.ejs');

  assert.match(detailPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-units-clean\.css\?v=/);
  assert.match(browserPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/);
  assert.match(browserPage, /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/);
});
