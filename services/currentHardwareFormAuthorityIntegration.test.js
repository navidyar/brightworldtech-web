'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit form retains effective Lot Tool policy and current-cycle Tool ownership context', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /lotToolPolicies\s*=\s*Object\.fromEntries/);
  assert.match(model, /resolveLotToolPolicy\(allLots, lot\.lot_id\)/);
  assert.match(model, /getCurrentHardwareFormAuthorityStatus/);
  assert.match(model, /run\.production_cycle_key\s*=\s*\?/);
  assert.match(model, /observation\.field_key IN \(\?, \?\)/);
  assert.match(model, /observation\.application_status IN \('applied', 'unchanged'\)/);
});

test('server submission path accepts manual Current Memory and Storage even when Tool context exists', () => {
  const controller = read('controllers/techController.js');
  const authority = read('services/currentHardwareFormAuthority.js');
  assert.match(controller, /applyCurrentHardwareAuthorityToSubmission/);
  assert.match(controller, /getCurrentHardwareFormAuthorityStatus\(/);
  assert.match(controller, /formOptions\.currentHardwareAuthority\s*=\s*currentHardwareAuthority/);
  assert.match(authority, /locked:\s*false/);
  assert.match(authority, /return \{ \.\.\.formData \};/);
  assert.doesNotMatch(authority, /result\.ramGb\s*=\s*isEdit/);
  assert.doesNotMatch(authority, /result\.storageGb\s*=\s*isEdit/);
});

test('Unit form exposes Tool ownership state for editable informational messaging', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(form, /data-current-memory-tool-owned/);
  assert.match(form, /data-current-storage-tool-owned/);
  assert.match(form, /data-current-hardware-field="memory"/);
  assert.match(form, /data-current-hardware-field="storage"/);
  assert.match(form, /data-current-hardware-authority-message="memory"/);
  assert.match(form, /data-current-hardware-authority-message="storage"/);
});

test('browser treats Tool ownership as informational and clears legacy Current hardware locks', () => {
  const script = read('public/js/tech-unit-form.js');
  const css = read('public/css/app.css');
  assert.match(script, /function updateCurrentHardwareToolContext/);
  assert.match(script, /section\.classList\.remove\('is-tool-controlled'\)/);
  assert.match(script, /data-current-hardware-authority-disabled/);
  assert.match(script, /control\.disabled = lotProfileDisabled/);
  assert.match(script, /Review and correct them manually if needed/);
  assert.doesNotMatch(script, /function setCurrentHardwareAuthorityState/);
  assert.doesNotMatch(css, /tech-memory-state--current\.is-tool-controlled/);
});

test('Previous and Current Memory and Storage all retain Add controls', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(form, /data-add-module-row="previousMemory"/);
  assert.match(form, /data-add-module-row="memory"/);
  assert.match(form, /data-add-module-row="previousStorage"/);
  assert.match(form, /data-add-module-row="storage"/);
});

test('all Unit form entry pages cache-bust the editable Current hardware script', () => {
  for (const relativePath of [
    'views/pages/tech-unit-detail.ejs',
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs'
  ]) {
    assert.match(read(relativePath), /\/js\/tech-unit-form\.js\?v=20260922-editable-current-hardware-v2/);
  }
});
