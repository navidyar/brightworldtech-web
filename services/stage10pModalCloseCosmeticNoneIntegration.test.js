'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Add/Edit Unit modal uses an SVG close mark instead of a font glyph', () => {
  const markup = read('views/fragments/tech-unit-modal.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(markup, /modal-close-button[\s\S]*?<svg class="tech-unit-modal-close-icon"[\s\S]*?<path d="M3\.5 3\.5 12\.5 12\.5M12\.5 3\.5 3\.5 12\.5"/);
  assert.doesNotMatch(markup, /modal-close-button[^>]*>×<\/button>/);
  assert.match(css, /#modal-root \.tech-unit-modal \.modal-close-button \{[\s\S]*?display:\s*inline-flex[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center[\s\S]*?font-size:\s*0[\s\S]*?line-height:\s*0/);
  assert.match(css, /\.tech-unit-modal-close-icon \{[\s\S]*?width:\s*14px[\s\S]*?height:\s*14px[\s\S]*?stroke:\s*currentColor/);
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
  for (const relativePath of [
    'views/pages/tech-unit-detail.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-units.ejs'
  ]) {
    assert.match(read(relativePath), /stage10q-hardware-none/);
  }
});
