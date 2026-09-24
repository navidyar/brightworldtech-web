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


test('Previous hardware distinguishes explicit zero from unknown without phantom rows', () => {
  const markup = readProjectFile('views/fragments/tech-unit-form.ejs');
  const script = readProjectFile('public/js/tech-unit-form.js');
  const controller = readProjectFile('controllers/techController.js');

  assert.match(markup, /const previousMemoryRows =[\s\S]*?: \[\];/);
  assert.match(markup, /const previousStorageRows =[\s\S]*?: \[\];/);
  assert.match(markup, /data-previous-memory-total-suffix/);
  assert.match(markup, /data-previous-storage-total-suffix/);
  assert.match(markup, /Not recorded/);
  assert.match(markup, /hasCapacityValue\(formData\.previousRamGb\) \? formData\.previousRamGb : ''/);
  assert.match(markup, /hasCapacityValue\(formData\.previousStorageGb\) \? formData\.previousStorageGb : ''/);

  assert.match(script, /COLLAPSIBLE_EMPTY_REPEATABLE_ROW_TYPES = new Set\(\['previousMemory', 'previousStorage'/);
  assert.match(script, /updatePreviousCapacityDisplay/);
  assert.match(script, /display\.textContent = hasRecordedValue \? \(formatCapacityGb\(displayedTotal\) \|\| '0GB'\) : 'Not recorded'/);

  assert.match(controller, /getNonNegativeIntegerOrBlank/);
  assert.match(controller, /previousRamGb: getComponentCapacityTotalGb\(previousMemoryModules, req\.body\.previousRamGb, \{ allowZero: true \}\)/);
  assert.match(controller, /previousStorageGb: getComponentCapacityTotalGb\(previousStorageDevices, req\.body\.previousStorageGb, \{ allowZero: true \}\)/);
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
  const css = readProjectFile('public/css/app.css');

  assert.match(css, /\.tech-memory-editor--compare/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.tech-memory-edit-row/);
  assert.match(css, /\.tech-storage-edit-row--previous/);
  assert.match(css, /\.tech-storage-edit-row--current/);
  assert.match(css, /\.tech-storage-edit-row \.tech-memory-remove-button[\s\S]*?grid-row: 1/);
  assert.match(css, /@media \(max-width: 980px\)/);
});


test('repeatable hardware Add targets its exact Previous or Current list without forcing a profile rerender', () => {
  const source = readProjectFile('public/js/tech-unit-form.js');
  const addModuleRow = source.match(/function addModuleRow\(form, rowType\) \{[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(addModuleRow, /data-module-list=\"\$\{rowType\}\"/);
  assert.match(addModuleRow, /data-module-template=\"\$\{rowType\}\"/);
  assert.match(addModuleRow, /list\.appendChild\(row\)/);
  assert.match(addModuleRow, /primeRepeatableRowFromCurrentProfile\(form, row\)/);
  assert.doesNotMatch(addModuleRow, /refreshLotUnitFormProfile/);
});

test('Lot profile re-enable path no longer restores legacy Current hardware authority disables', () => {
  const source = readProjectFile('public/js/tech-unit-form.js');
  const profileState = source.match(/function updateProfileManagedSubmissionState\(form, scope, visible\) \{[\s\S]*?\n  \}/)?.[0] || '';
  const companionState = source.match(/function updateCompanionSubmissionState\(form, fieldKey, visible\) \{[\s\S]*?\n  \}/)?.[0] || '';

  assert.match(profileState, /control\.disabled = false/);
  assert.match(companionState, /control\.disabled = false/);
  assert.doesNotMatch(profileState, /data-current-hardware-authority-disabled/);
  assert.doesNotMatch(companionState, /data-current-hardware-authority-disabled/);
});

test('Previous and Current hardware panels keep stable sides and linked visibility', () => {
  const css = readProjectFile('public/css/app.css');
  const resolver = readProjectFile('services/lotUnitFormProfileResolver.js');
  const controller = readProjectFile('controllers/lotController.js');
  const modal = readProjectFile('views/fragments/lot-unit-form-rules-modal.ejs');

  assert.match(css, /tech-memory-state--previous[\s\S]*grid-column:\s*1/);
  assert.match(css, /tech-memory-state--current[\s\S]*grid-column:\s*2/);
  assert.match(resolver, /function applyLinkedVisibility\(statesByKey\)/);
  assert.match(resolver, /type:\s*'linked_field'/);
  assert.match(controller, /field\.inheritVisibilityFromFieldKey[\s\S]*VISIBILITY\.INHERIT/);
  assert.match(modal, /field\.inheritVisibilityFromFieldKey/);
  assert.match(modal, /Follows Current/);
});
