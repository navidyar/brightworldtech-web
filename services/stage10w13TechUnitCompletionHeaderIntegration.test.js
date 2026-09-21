'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('all users receive a completion timestamp in the orange Unit Details header', () => {
  const markup = read('views/fragments/tech-units-table.ejs');

  assert.doesNotMatch(markup, /showCompletionAtGlance/);
  assert.match(markup, /if \(unit\.latestWorkCompletion && unit\.latestWorkCompletion\.completedAt\)/);
  assert.match(markup, /class="tech-detail-completion-at"/);
  assert.match(markup, /Completed: <%= formatDateTime\(unit\.latestWorkCompletion\.completedAt\) %>/);
});

test('the at-a-glance timestamp uses the current non-reversed work completion instead of History access', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(controller, /getLatestWorkCompletionMapForUnits\(unitIds\)/);
  assert.match(controller, /latestWorkCompletion: latestCompletionMap\.get\(Number\(unit\.unitId\)\) \|\| null/);
  assert.match(model, /AND c\.credit_source = 'manual_completion'/);
  assert.match(model, /AND c\.reversed_at IS NULL/);
  assert.match(model, /completedAt: row\.completed_at/);
});

test('the completion timestamp is emphasized as text without adding a boxed status control', () => {
  const css = read('public/css/app.css');
  const selector = '.tech-units-clean-page .tech-detail-header--details .tech-detail-title .tech-detail-completion-at';
  const start = css.indexOf(selector);

  assert.notEqual(start, -1);
  const block = css.slice(start, start + 260);
  assert.match(block, /color:\s*#704116/);
  assert.match(block, /font-weight:\s*650/);
  assert.doesNotMatch(block, /border:/);
  assert.doesNotMatch(block, /background:/);
  assert.doesNotMatch(block, /box-shadow:/);
});

test('all Tech Unit entry points use the shared Tech Units CSS scope', () => {
  assert.match(read('views/partials/head.ejs'), /\/css\/app\.css\?v=/);
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ]) {
    const page = read(relativePath);
    assert.match(page, /<body class="css-scope-tech-units">/);
    assert.doesNotMatch(page, /tech-units-clean\.css/);
  }
});
