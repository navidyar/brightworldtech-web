'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('duplicate visible capacity fields are replaced by derived hidden totals', () => {
  const form = read('views/fragments/tech-unit-form.ejs');

  assert.doesNotMatch(form, /class="hardware-capacity-matrix"/);
  assert.doesNotMatch(form, /<h3>Memory &amp; Storage<\/h3>/);
  assert.match(form, /data-hardware-derived-totals/);
  assert.match(form, /type="hidden"[\s\S]*?name="previousRamGb"[\s\S]*?data-previous-memory-total-input/);
  assert.match(form, /type="hidden"[\s\S]*?name="ramGb"[\s\S]*?data-memory-total-input/);
  assert.match(form, /type="hidden"[\s\S]*?name="previousStorageGb"[\s\S]*?data-previous-storage-total-input/);
  assert.match(form, /type="hidden"[\s\S]*?name="storageGb"[\s\S]*?data-storage-total-input/);
  assert.match(form, /data-unit-form-field-key="previous_memory_size"/);
  assert.match(form, /data-unit-form-field-key="previous_storage_size"/);
  assert.match(form, /data-unit-form-companion-key="memory_modules"/);
  assert.match(form, /data-unit-form-companion-key="storage_devices"/);
});

test('structured rows own copy controls and synchronize submitted totals', () => {
  const script = read('public/js/tech-unit-form.js');

  assert.match(script, /data-copy-previous-memory/);
  assert.match(script, /data-copy-previous-storage/);
  assert.match(script, /data-auto-from-components/);
  assert.match(script, /synchronizeCurrentCapacityFromComponents/);
  assert.doesNotMatch(script, /data-copy-previous-capacity/);
  assert.doesNotMatch(script, /function updateCopyPreviousButtons/);
});

test('structured Current rows determine submitted totals while valid summary-only legacy values remain supported', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(controller, /function getComponentCapacityTotalGb\(rows, submittedLegacyTotal\)/);
  assert.match(controller, /ramGb: getComponentCapacityTotalGb\(memoryModules, req\.body\.ramGb\)/);
  assert.match(controller, /storageGb: getComponentCapacityTotalGb\(storageDevices, req\.body\.storageGb\)/);
  assert.match(model, /submittedMemoryTotalGb = normalizeOptionalNonNegativeInteger\(formData\.ramGb\)/);
  assert.match(model, /submittedStorageTotalGb = normalizeOptionalNonNegativeInteger\(formData\.storageGb\)/);
  assert.match(model, /memoryTotalGb = submittedMemoryTotalGb !== null/);
  assert.match(model, /storageTotalGb = submittedStorageTotalGb !== null/);
});

test('the two comparison sides use equal width and stack responsively', () => {
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /\.tech-memory-editor--compare[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.tech-memory-editor--compare[\s\S]*?grid-template-columns: 1fr/);
});
