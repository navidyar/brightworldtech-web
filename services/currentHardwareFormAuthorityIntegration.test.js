'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit form receives effective Lot Tool policy and current-cycle Tool ownership', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /lotToolPolicies\s*=\s*Object\.fromEntries/);
  assert.match(model, /resolveLotToolPolicy\(allLots, lot\.lot_id\)/);
  assert.match(model, /getCurrentHardwareFormAuthorityStatus/);
  assert.match(model, /run\.production_cycle_key\s*=\s*\?/);
  assert.match(model, /observation\.field_key IN \(\?, \?\)/);
  assert.match(model, /observation\.application_status IN \('applied', 'unchanged'\)/);
});

test('server submission path preserves or rejects manual Current Memory and Storage according to authority', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /applyCurrentHardwareAuthorityToSubmission/);
  assert.match(controller, /getCurrentHardwareFormAuthorityStatus\(/);
  assert.match(controller, /formOptions\.currentHardwareAuthority\s*=\s*currentHardwareAuthority/);
});

test('Unit form exposes Tool requirement and ownership state to the browser', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(form, /data-current-memory-tool-owned/);
  assert.match(form, /data-current-storage-tool-owned/);
  assert.match(form, /data-require-scantools/);
  assert.match(form, /data-require-techtools/);
  assert.match(form, /data-current-hardware-field="memory"/);
  assert.match(form, /data-current-hardware-field="storage"/);
  assert.match(form, /data-current-hardware-authority-message="memory"/);
  assert.match(form, /data-current-hardware-authority-message="storage"/);
});

test('browser disables only Current Memory/Storage while leaving Previous hardware outside the lock scope', () => {
  const script = read('public/js/tech-unit-form.js');
  assert.match(script, /function updateCurrentHardwareAuthorityState\(form\)/);
  assert.match(script, /lotPolicy\.requiresTools \|\| memoryToolOwned/);
  assert.match(script, /lotPolicy\.requiresTools \|\| storageToolOwned/);
  assert.match(script, /\[data-current-hardware-field=/);
  assert.match(script, /data-current-hardware-authority-disabled/);
  assert.match(script, /Previous values remain editable/);
  assert.doesNotMatch(script, /data-current-hardware-field="previous/);
});

test('Tool-controlled Current sections have explicit gray/read-only presentation', () => {
  const css = read('public/css/app.css');
  assert.match(css, /tech-memory-state--current\.is-tool-controlled/);
  assert.match(css, /tech-current-hardware-authority-message/);
});
