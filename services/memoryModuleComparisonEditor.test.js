'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('memory editor stores editable Previous and Current module rows', () => {
  const markup = readProjectFile('views/fragments/tech-unit-form.ejs');

  assert.match(markup, /tech-memory-editor--compare/);
  assert.match(markup, /data-module-list="previousMemory"/);
  assert.match(markup, /name="previousMemoryModules\[<%= index %>\]\[sizeGb\]"/);
  assert.match(markup, /name="previousMemoryModules\[<%= index %>\]\[ramTypeConfigValueId\]"/);
  assert.match(markup, /name="previousMemoryModules\[<%= index %>\]\[memoryInstallTypeCode\]"/);
  assert.match(markup, /name="memoryModules\[<%= index %>\]\[sizeGb\]"/);
  assert.match(markup, /data-previous-memory-total-display/);
  assert.match(markup, /data-memory-total-display/);
});

test('storage editor keeps Previous lean and Current operational', () => {
  const markup = readProjectFile('views/fragments/tech-unit-form.ejs');
  const previousStorageBlock = markup.match(/data-module-list="previousStorage"[\s\S]*?<\/section>/)?.[0] || '';
  const currentStorageBlock = markup.match(/data-module-list="storage"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(markup, /data-module-list="previousStorage"/);
  assert.match(markup, /name="previousStorageDevices\[<%= index %>\]\[sizeGb\]"/);
  assert.match(markup, /name="previousStorageDevices\[<%= index %>\]\[storageTypeConfigValueId\]"/);
  assert.doesNotMatch(previousStorageBlock, /wipeStatusConfigValueId/);
  assert.match(previousStorageBlock, /name="previousStorageDevices\[<%= index %>\]\[componentRowId\]"/);
  assert.doesNotMatch(previousStorageBlock, /<span>Wipe Status<\/span>/);
  assert.doesNotMatch(previousStorageBlock, /<span>Notes<\/span>/);
  assert.match(currentStorageBlock, /name="storageDevices\[<%= index %>\]\[storageTypeConfigValueId\]"/);
  assert.match(currentStorageBlock, /<span>Wipe Status<\/span>/);
  assert.doesNotMatch(currentStorageBlock, /<span>Notes<\/span>/);
  assert.match(markup, /data-previous-storage-total-display/);
  assert.match(markup, /data-storage-total-display/);
});

test('Previous-to-Current copy preserves supported component properties', () => {
  const source = readProjectFile('public/js/tech-unit-form.js');
  const memoryCopy = source.match(/function copyPreviousMemoryToCurrent[\s\S]*?\n  }/)?.[0] || '';
  const storageCopy = source.match(/function copyPreviousStorageToCurrent[\s\S]*?\n  }/)?.[0] || '';

  assert.match(source, /function copyPreviousRowsToCurrent/);
  for (const fieldName of [
    'slotLabel',
    'sizeGb',
    'ramTypeConfigValueId',
    'memoryInstallTypeCode'
  ]) {
    assert.match(memoryCopy, new RegExp(`'${fieldName}'`));
  }
  for (const fieldName of [
    'slotLabel',
    'sizeGb',
    'storageTypeConfigValueId'
  ]) {
    assert.match(storageCopy, new RegExp(`'${fieldName}'`));
  }
  assert.doesNotMatch(memoryCopy, /speedMhz|manufacturerName|partNumber|serialNumber|changeNotes/);
  assert.doesNotMatch(storageCopy, /manufacturerName|modelNumber|serialNumber|firmwareVersion|wipeStatusConfigValueId|changeNotes/);
  assert.match(source, /updateModuleTotals\(form\)/);
});

test('Previous components use dedicated persistence while Lot requirements remain Current-only', () => {
  const modelSource = readProjectFile('models/techUnitModel.js');
  const controllerSource = readProjectFile('controllers/techController.js');
  const policySource = readProjectFile('services/unitFormSubmissionPolicy.js');

  assert.match(modelSource, /unit_previous_memory_modules/);
  assert.match(modelSource, /unit_previous_storage_devices/);
  assert.match(modelSource, /saveUnitPreviousMemoryModules/);
  assert.match(modelSource, /saveUnitPreviousStorageDevices/);
  assert.match(controllerSource, /previousMemoryModules/);
  assert.match(controllerSource, /previousStorageDevices/);
  assert.match(policySource, /previous_memory_size:[\s\S]*previousMemoryModules/);
  assert.match(policySource, /previous_storage_size:[\s\S]*previousStorageDevices/);
});

test('hardware comparison uses equal flat columns and responsive storage rows', () => {
  const css = readProjectFile('public/css/tech-units-clean.css');

  assert.match(css, /\.tech-memory-editor--compare/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.tech-memory-edit-row/);
  assert.match(css, /\.tech-storage-edit-row--previous/);
  assert.match(css, /\.tech-storage-edit-row--current/);
  assert.match(css, /\.tech-storage-edit-row \.tech-memory-remove-button[\s\S]*?grid-row: 1/);
  assert.match(css, /@media \(max-width: 980px\)/);
});
