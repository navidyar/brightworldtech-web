'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('component editors submit only current-use fields and an operational row id', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const forbiddenNames = [
    'speedMhz',
    'manufacturerName',
    'partNumber',
    'modelNumber',
    'firmwareVersion',
    'changeNotes'
  ];

  forbiddenNames.forEach((fieldName) => {
    assert.doesNotMatch(markup, new RegExp(`\\[${fieldName}\\]`));
  });
  assert.doesNotMatch(markup, /previousStorageDevices\[[^\]]+\]\[wipeStatusConfigValueId\]/);
  assert.match(markup, /previousMemoryModules\[<%= index %>\]\[componentRowId\]/);
  assert.match(markup, /memoryModules\[<%= index %>\]\[componentRowId\]/);
  assert.match(markup, /previousStorageDevices\[<%= index %>\]\[componentRowId\]/);
  assert.match(markup, /storageDevices\[<%= index %>\]\[componentRowId\]/);
  assert.match(markup, /type="hidden" name="previousStorageDevices\[<%= index %>\]\[serialNumber\]"/);
  assert.match(markup, /type="hidden" name="storageDevices\[<%= index %>\]\[serialNumber\]"/);
  assert.doesNotMatch(markup, /memoryModules\[[^\]]+\]\[serialNumber\]/);
  assert.doesNotMatch(markup, /<span>Storage Serial Number<\/span>/);
});

test('request parsing ignores removed optional component metadata', () => {
  const controller = read('controllers/techController.js');
  const memoryParser = controller.match(/function getMemoryModulesFromRequest[\s\S]*?\n}\n\nfunction getStorageDevicesFromRequest/)?.[0] || '';
  const storageParser = controller.match(/function getStorageDevicesFromRequest[\s\S]*?\n}\n\nfunction getIssueRowsFromBody/)?.[0] || '';

  assert.match(memoryParser, /componentRowId/);
  assert.match(storageParser, /componentRowId/);
  assert.doesNotMatch(memoryParser, /speedMhz|manufacturerName|partNumber|serialNumber|changeNotes/);
  assert.doesNotMatch(storageParser, /manufacturerName|modelNumber|serialNumber|firmwareVersion|changeNotes/);
});

test('server-side persistence preserves legacy optional component details by verified row id', () => {
  const model = read('models/techUnitModel.js');
  const preservation = read('services/componentDetailPreservation.js');

  assert.match(model, /loadComponentDetailMap/);
  assert.match(model, /WHERE unit_id = \?/);
  assert.match(model, /AND is_current = 1/);
  assert.match(model, /mergePreservedMemoryDetails/);
  assert.match(model, /mergePreservedStorageDetails/);
  assert.match(preservation, /moduleRow\.componentRowId/);
  assert.match(preservation, /deviceRow\.componentRowId/);
  assert.match(preservation, /moduleRow\.sizeGb === 0/);
  assert.match(preservation, /deviceRow\.sizeGb === 0/);
});

test('previous-to-current copy transfers only fields visible in the slim editor', () => {
  const source = read('public/js/tech-unit-form.js');
  const memoryCopy = source.match(/function copyPreviousMemoryToCurrent[\s\S]*?\n  }/)?.[0] || '';
  const storageCopy = source.match(/function copyPreviousStorageToCurrent[\s\S]*?\n  }/)?.[0] || '';

  for (const fieldName of ['slotLabel', 'sizeGb', 'ramTypeConfigValueId', 'memoryInstallTypeCode']) {
    assert.match(memoryCopy, new RegExp(`'${fieldName}'`));
  }
  for (const fieldName of ['slotLabel', 'sizeGb', 'storageTypeConfigValueId']) {
    assert.match(storageCopy, new RegExp(`'${fieldName}'`));
  }
  assert.doesNotMatch(memoryCopy, /speedMhz|manufacturerName|partNumber|serialNumber|changeNotes/);
  assert.doesNotMatch(storageCopy, /manufacturerName|modelNumber|serialNumber|firmwareVersion|changeNotes|wipeStatusConfigValueId/);
});

test('shared scrollbar palette lives in theme.css and presentation lives in app.css', () => {
  const theme = read('public/css/theme.css');
  const app = read('public/css/app.css');
  const head = read('views/partials/head.ejs');

  assert.match(theme, /--ui-scrollbar-track:/);
  assert.match(theme, /--ui-scrollbar-thumb:/);
  assert.match(theme, /--ui-scrollbar-thumb-hover:/);
  assert.match(app, /\*::-webkit-scrollbar/);
  assert.match(app, /scrollbar-color: var\(--ui-scrollbar-thumb\) var\(--ui-scrollbar-track\)/);
  assert.match(app, /unit-export-preview-top-scroll-thumb[\s\S]*var\(--ui-scrollbar-thumb\)/);
  assert.match(head, /theme\.css\?v=[^\"\'\s>]+/);
  assert.match(head, /app\.css\?v=[^"\'\s>]+/);
  assert.match(head, /features\.css\?v=[^\"\'\s>]+/);
});

test('cleanup and health commands are included in the Stage 10T contract', () => {
  const packageJson = JSON.parse(read('package.json'));
  const cleanupScript = read('scripts/cleanup-stage-10t-source-artifacts.sh');

  assert.equal(packageJson.scripts['cleanup:stage10-source-artifacts'], 'bash scripts/cleanup-stage-10t-source-artifacts.sh');
  assert.equal(packageJson.scripts['validate:stage10-stabilization'], 'bash scripts/runStage10tStabilizationValidation.sh');
  assert.match(cleanupScript, /\.orig/);
  assert.match(cleanupScript, /\.rej/);
  assert.match(cleanupScript, /Refusing to remove non-empty unexpected artifact/);
});
