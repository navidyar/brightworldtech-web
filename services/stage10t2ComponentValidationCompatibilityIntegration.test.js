'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const controllerPath = path.join(__dirname, '..', 'controllers', 'techController.js');
const source = fs.readFileSync(controllerPath, 'utf8');

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);

  const end = source.indexOf(`\nfunction ${nextName}(`, start + 1);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);

  return source.slice(start, end);
}

test('Memory validation only reads fields still posted by the compact Stage 10T form', () => {
  const block = extractFunction('validateMemoryModules', 'validateStorageDevices');

  assert.match(block, /moduleRow\.sizeGb/);
  assert.match(block, /moduleRow\.ramTypeConfigValueId/);
  assert.match(block, /moduleRow\.memoryInstallTypeCode/);
  assert.match(block, /moduleRow\.slotLabel/);
  assert.doesNotMatch(block, /moduleRow\.(?:speedMhz|manufacturerName|partNumber|serialNumber|changeNotes)/);
});

test('Storage validation only reads fields still posted by the compact Stage 10T form', () => {
  const start = source.indexOf('function validateStorageDevices(');
  assert.notEqual(start, -1, 'validateStorageDevices must exist');
  const end = source.indexOf('\nfunction ', start + 1);
  const block = source.slice(start, end === -1 ? source.length : end);

  assert.match(block, /deviceRow\.sizeGb/);
  assert.match(block, /deviceRow\.storageTypeConfigValueId/);
  assert.match(block, /deviceRow\.wipeStatusConfigValueId/);
  assert.match(block, /deviceRow\.slotLabel/);
  assert.doesNotMatch(block, /deviceRow\.(?:manufacturerName|modelNumber|serialNumber|firmwareVersion|changeNotes)/);
});

test('request parsers continue to omit removed optional component-detail fields', () => {
  const memoryParser = extractFunction('getMemoryModulesFromRequest', 'getStorageDevicesFromRequest');
  const storageParser = extractFunction('getStorageDevicesFromRequest', 'getIssueRowsFromBody');

  assert.doesNotMatch(memoryParser, /speedMhz|manufacturerName|partNumber|serialNumber|changeNotes/);
  assert.doesNotMatch(storageParser, /manufacturerName|modelNumber|serialNumber|firmwareVersion|changeNotes/);
});
