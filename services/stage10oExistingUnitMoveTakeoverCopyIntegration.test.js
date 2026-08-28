'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Create Unit lot status explains move/takeover behavior in technician-friendly language', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');

  assert.match(markup, /Existing Unit Move\/Takeover/);
  assert.match(markup, /Matching existing units can be moved or taken over without approval\./);
  assert.match(markup, /Moving or taking over a matching existing unit requires Management or Tech Lead approval\./);
  assert.doesNotMatch(markup, /Existing-unit assumption is/);
});

test('lot changes replace the explanatory sentence without rebuilding technical assumption wording', () => {
  const client = read('public/js/tech-unit-form.js');

  assert.match(client, /const statusMessage = assumptionEnabled/);
  assert.match(client, /Matching existing units can be moved or taken over without approval\./);
  assert.match(client, /Moving or taking over a matching existing unit requires Management or Tech Lead approval\./);
  assert.match(client, /title\.textContent = 'Existing Unit Move\/Takeover'/);
  assert.doesNotMatch(client, /document\.createTextNode\('Existing-unit assumption is '/);
});

test('related user-facing errors use the same move/takeover terminology', () => {
  const client = read('public/js/tech-unit-form.js');
  const model = read('models/techUnitModel.js');

  assert.match(client, /existing unit move\/takeover review could not be opened/i);
  assert.match(model, /Existing Unit Move\/Takeover is available only to regular Tech users/);
  assert.doesNotMatch(client, /existing-unit assumption review/i);
  assert.doesNotMatch(model, /Existing-unit assumption is available/i);
});

test('the heading and status message retain a compact two-line treatment', () => {
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /\.tech-lot-assumption-status-title\s*\{[\s\S]*?display:\s*block[\s\S]*?margin:\s*0 0 3px/);
  assert.match(css, /\.tech-lot-assumption-status \[data-assignable-lot-assumption-status-state\]\s*\{[\s\S]*?display:\s*block/);
});

test('Stage 10O assets are cache-busted on modal and full-page entry points', () => {
  const detailPage = read('views/pages/tech-unit-detail.ejs');
  const formPage = read('views/pages/tech-unit-form.ejs');
  const browserPage = read('views/pages/tech-units.ejs');

  assert.match(detailPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-units-clean\.css\?v=/);
  assert.match(browserPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-unit-form\.js\?v=[^"\'\s>]+/);
  assert.match(browserPage, /tech-unit-form\.js\?v=[^"\'\s>]+/);
});
