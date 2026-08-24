'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadLotOwnedConfigurationCleanup() {
  const model = read('models/lotModel.js');
  const constantStart = model.indexOf('const LOT_OWNED_CONFIGURATION_TABLES =');
  const helperEnd = model.indexOf('\nfunction pickColumn', constantStart);

  assert.ok(constantStart >= 0 && helperEnd > constantStart, 'Lot cleanup helper should be extractable');

  const context = {};
  vm.runInNewContext(`${model.slice(constantStart, helperEnd)}; this.cleanup = deleteLotOwnedConfigurationRows;`, context);
  return context.cleanup;
}


test('legacy empty Lot deletion explicitly clears all Lot-owned configuration rows', () => {
  const model = read('models/lotModel.js');

  assert.match(model, /const LOT_OWNED_CONFIGURATION_TABLES = \[[\s\S]*'lot_requirement_inheritance_suppressions'[\s\S]*'lot_unit_form_field_rules'[\s\S]*'lot_requirements'[\s\S]*\];/);
  assert.match(model, /async function deleteLotOwnedConfigurationRows\(connection, lotId\)/);
  assert.match(model, /information_schema\.COLUMNS[\s\S]*COLUMN_NAME = 'lot_id'[\s\S]*TABLE_NAME IN/);
  assert.match(model, /await deleteLotOwnedConfigurationRows\(connection, lotId\);[\s\S]*DELETE FROM lots WHERE lot_id = \? LIMIT 1/);
});



test('legacy Lot cleanup removes only known configuration tables that actually exist', async () => {
  const cleanup = loadLotOwnedConfigurationCleanup();
  const calls = [];
  const connection = {
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (/information_schema\.COLUMNS/.test(sql)) {
        return [[
          { tableName: 'lot_requirement_inheritance_suppressions' },
          { tableName: 'lot_unit_form_field_rules' },
          { tableName: 'lot_requirements' }
        ]];
      }

      return [{ affectedRows: 1 }];
    }
  };

  await cleanup(connection, 27);

  assert.equal(calls.length, 4);
  assert.deepEqual(Array.from(calls[0].values), [
    'lot_requirement_inheritance_suppressions',
    'lot_unit_form_field_rules',
    'lot_requirements'
  ]);
  assert.match(calls[1].sql, /DELETE FROM `lot_requirement_inheritance_suppressions` WHERE lot_id = \?/);
  assert.match(calls[2].sql, /DELETE FROM `lot_unit_form_field_rules` WHERE lot_id = \?/);
  assert.match(calls[3].sql, /DELETE FROM `lot_requirements` WHERE lot_id = \?/);
  calls.slice(1).forEach((call) => assert.deepEqual(Array.from(call.values), [27]));
});

test('Unit Browser keeps the approved ceiling while slightly increasing Unit / Weight floor', () => {
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /--tu-table-base-width:\s*1220px;/);
  assert.match(css, /--tu-unit-base-width:\s*445px;/);
  assert.match(css, /--tu-unit-max-width:\s*480px;/);
});
