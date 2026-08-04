'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Lot-hidden controls are disabled in both Create and Edit before native validation', () => {
  const source = read('public/js/tech-unit-form.js');
  const managedState = source.match(/function updateProfileManagedSubmissionState[\s\S]*?\n  }/)?.[0] || '';
  const companionState = source.match(/function updateCompanionSubmissionState[\s\S]*?\n  }/)?.[0] || '';

  assert.doesNotMatch(managedState, /createMode/);
  assert.doesNotMatch(companionState, /createMode/);
  assert.match(managedState, /if \(visible\)/);
  assert.match(managedState, /control\.disabled = true/);
  assert.match(managedState, /server-side submission policy/);
});

test('component totals are synchronized before submit verification and fingerprints', () => {
  const source = read('public/js/tech-unit-form.js');
  const firstSubmit = source.match(/document\.addEventListener\('submit',[\s\S]*?const lotSelect = getAssignableLotCatalog\(form\);/)?.[0] || '';

  assert.match(firstSubmit, /updateModuleTotals\(form\)/);
  assert.ok(firstSubmit.indexOf('updateModuleTotals(form)') < firstSubmit.indexOf('getAssignableLotCatalog(form)'));
});

test('server derives totals from structured rows and sanitizes hidden legacy summaries', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /function getComponentCapacityTotalGb\(rows, submittedLegacyTotal\)/);
  assert.match(controller, /hasStructuredCapacityEntry\(rows\)[\s\S]*?return String\(componentTotal\)/);
  assert.match(controller, /return getPositiveIntegerOrBlank\(submittedLegacyTotal\)/);
  assert.match(controller, /previousRamGb: getComponentCapacityTotalGb\(previousMemoryModules, req\.body\.previousRamGb\)/);
  assert.match(controller, /ramGb: getComponentCapacityTotalGb\(memoryModules, req\.body\.ramGb\)/);
  assert.match(controller, /previousStorageGb: getComponentCapacityTotalGb\(previousStorageDevices, req\.body\.previousStorageGb\)/);
  assert.match(controller, /storageGb: getComponentCapacityTotalGb\(storageDevices, req\.body\.storageGb\)/);
});
