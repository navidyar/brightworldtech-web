'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Add/Edit Unit modal uses the shared centered close-button contract', () => {
  const markup = read('views/fragments/tech-unit-modal.ejs');
  const css = read('public/css/app.css');

  assert.match(markup, /class="modal-close-button"/);
  assert.doesNotMatch(markup, /tech-unit-modal-close-icon/);
  assert.match(css, /\.modal-panel :is\(\.modal-close-button, \.modal-close\)[\s\S]*?background:\s*var\(--ui-blue\)/);
  assert.match(css, /\.modal-panel :is\(\.modal-close-button, \.modal-close\)::before/);
  assert.match(css, /\.modal-panel :is\(\.modal-close-button, \.modal-close\)::after/);
});

test('cosmetic None options are marked by semantic configuration values', () => {
  const model = read('models/unitIssueEntryModel.js');

  assert.match(model, /function isNoCosmeticIssueOption\(option\)/);
  assert.match(model, /'none'[\s\S]*?'no_cosmetic_issue'/);
  assert.match(model, /isNoIssue:\s*isNoCosmeticIssueOption\(option\)/);
});

test('cosmetic None disables and clears severity and location in the browser', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const client = read('public/js/tech-unit-form.js');

  assert.match(markup, /data-cosmetic-issue-type-select/);
  assert.match(markup, /data-no-issue="<%= issueType\.isNoIssue \? 'true' : 'false' %>"/);
  assert.match(markup, /data-cosmetic-no-issue-flag/);
  assert.match(markup, /data-cosmetic-detail-field/);
  assert.match(client, /function syncCosmeticIssueRowState\(row\)/);
  assert.match(client, /control\.value = ''[\s\S]*?control\.disabled = isNoIssue/);
  assert.match(client, /issueTypeSelected && \([\s\S]*?isNoIssue/);
});

test('server validation derives None from configured issue metadata and skips detail requirements only for None', () => {
  const controller = read('controllers/techController.js');
  const policy = read('services/unitFormSubmissionPolicy.js');

  assert.match(controller, /function normalizeCosmeticIssueRowsForSubmission\(formData, formOptions = \{\}\)/);
  assert.match(controller, /issueRow\.isNoIssue = isNoIssue \? '1' : ''/);
  assert.match(controller, /if \(isNoIssue\) \{[\s\S]*?severityConfigValueId = ''[\s\S]*?locationConfigValueId = ''/);
  assert.match(controller, /if \(!isNoIssue && \(!issueRow\.severityConfigValueId/);
  assert.match(controller, /if \(!isNoIssue && \(!issueRow\.locationConfigValueId/);
  assert.match(policy, /normalizeText\(row\.isNoIssue\) === '1'/);
});

test('Stage 10P assets are cache-busted on modal and full-page entry points', () => {
  const detailPage = read('views/pages/tech-unit-detail.ejs');
  const formPage = read('views/pages/tech-unit-form.ejs');
  const browserPage = read('views/pages/tech-units.ejs');

  assert.match(detailPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-units-clean\.css\?v=/);
  assert.match(browserPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-unit-form\.js\?v=[^\"]+/);
  assert.match(browserPage, /tech-unit-form\.js\?v=[^\"]+/);
});
