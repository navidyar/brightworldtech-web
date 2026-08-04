'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseHardwareCapacityToGb,
  normalizeHardwareCapacityForStorage
} = require('./hardwareCapacity');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('common decimal and binary GB entries normalize to canonical TB storage', () => {
  const expectations = new Map([
    ['1000', { gb: 1024, canonical: '1TB' }],
    ['1024', { gb: 1024, canonical: '1TB' }],
    ['2000', { gb: 2048, canonical: '2TB' }],
    ['2048', { gb: 2048, canonical: '2TB' }],
    ['3000GB', { gb: 3072, canonical: '3TB' }],
    ['3072GB', { gb: 3072, canonical: '3TB' }]
  ]);

  expectations.forEach((expected, input) => {
    const parsed = parseHardwareCapacityToGb(input);
    assert.equal(parsed.valid, true, input);
    assert.equal(parsed.gb, expected.gb, input);
    assert.equal(parsed.canonical, expected.canonical, input);
    assert.equal(normalizeHardwareCapacityForStorage(input), String(expected.gb), input);
  });
});

test('new Memory Type, Install Type, and Storage Type controls begin unselected', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');

  assert.match(markup, /memoryInstallTypeCode: ''/);
  assert.doesNotMatch(markup, /blankCurrentMemoryRow/);
  assert.match(markup, /<option value="">Select memory type<\/option>/);
  assert.match(markup, /<option value="">Select install type<\/option>/);
  assert.match(markup, /<option value="">Select storage type<\/option>/);
  assert.doesNotMatch(markup, /installType\.code === '(?:unknown|removable_module)' \? 'selected'/);
  assert.doesNotMatch(markup, /selectedInstallType\(moduleRow\.memoryInstallTypeCode \|\| 'unknown'/);

  // Unknown remains a legitimate explicit Install Type option.
  assert.match(markup, /\{ code: 'unknown', label: 'Unknown' \}/);
});

test('client and server require explicit type selections only for meaningful hardware rows', () => {
  const client = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');
  const policy = read('services/unitFormSubmissionPolicy.js');

  assert.match(client, /function validateHardwareRowSelections/);
  assert.match(client, /Select a Memory Type for this module/);
  assert.match(client, /Select an Install Type for this module/);
  assert.match(client, /Select a Storage Type for this device/);
  assert.match(client, /validateAllCapacityInputs\(form, true\) \|\| !validateHardwareRowSelections\(form, true\)/);

  assert.match(controller, /requires a Memory Type selection/);
  assert.match(controller, /requires an Install Type selection/);
  assert.match(controller, /requires a Storage Type selection/);
  assert.doesNotMatch(controller, /DEFAULT_MEMORY_INSTALL_TYPE_CODE/);

  assert.match(model, /memoryInstallTypeCode: ''/);
  assert.match(model, /'memory_install_type_code', moduleRow\.memoryInstallTypeCode\)/);
  assert.doesNotMatch(model, /'memory_install_type_code', moduleRow\.memoryInstallTypeCode \|\| DEFAULT_MEMORY_INSTALL_TYPE_CODE/);
  assert.match(policy, /rowHasMeaningfulValue\(row, \['slotLabel'\]\)/);
});

test('browser parser mirrors server normalization for common TB-sized numeric entries', () => {
  const client = read('public/js/tech-unit-form.js');

  assert.match(client, /amount % 1024 === 0/);
  assert.match(client, /amount % 1000 === 0/);
  assert.match(client, /gb = \(amount \/ 1000\) \* 1024/);
  assert.match(client, /1000\/1024 and 2000\/2048 automatically normalize/);
});
