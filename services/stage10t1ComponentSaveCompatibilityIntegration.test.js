'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const modelPath = path.join(__dirname, '..', 'models', 'techUnitModel.js');
const source = fs.readFileSync(modelPath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);

  const next = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('optional component-detail lookup only filters current rows when the table supports is_current', () => {
  const block = extractFunction('loadComponentDetailMap');

  assert.match(block, /\{ currentOnly = false \} = \{\}/);
  assert.match(block, /currentOnly && hasColumn\(tableColumns, 'is_current'\)/);
  assert.match(block, /\? 'AND is_current = 1'/);
  assert.doesNotMatch(block, /whereClause/);
});

test('optional legacy-detail preservation cannot block a normal component save on schema-only lookup errors', () => {
  const block = extractFunction('loadComponentDetailMap');

  assert.match(block, /ER_BAD_FIELD_ERROR/);
  assert.match(block, /ER_NO_SUCH_TABLE/);
  assert.match(block, /ER_PARSE_ERROR/);
  assert.match(block, /return new Map\(\);/);
  assert.match(block, /throw error;/);
});

test('current Memory and Storage lookups request current-only filtering through the guarded option', () => {
  const memorySaveStart = source.indexOf('async function saveUnitMemoryModules(');
  const storageSaveStart = source.indexOf('async function saveUnitStorageDevices(');
  const moduleRowsStart = source.indexOf('async function saveUnitModuleRows(');

  const memoryBlock = source.slice(memorySaveStart, storageSaveStart);
  const storageBlock = source.slice(storageSaveStart, moduleRowsStart);

  assert.match(memoryBlock, /'unit_memory_modules'[\s\S]*\{ currentOnly: true \}/);
  assert.match(storageBlock, /'unit_storage_devices'[\s\S]*\{ currentOnly: true \}/);
});
