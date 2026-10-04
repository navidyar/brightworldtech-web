'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Commit exposes no direct inventory route or lifecycle mutation', () => {
  const routes = read('routes/api.js');
  const commit = read('services/apiUnitCommit.js');
  assert.match(routes, /router\.post\('\/units\/commit', requireApiAuth, requireUnitApiAccess/);
  assert.doesNotMatch(routes, /router\.put\('\/units\/:unitId\/inventory/);
  assert.doesNotMatch(commit, /recordUnitWorkCompletion|reverseUnitWorkCompletion|productionWeightModel|productionCycleModel|recordUnitLotHistory/);
  assert.match(commit, /expectedUnitState: resolution\.preflight\.current_unit/);
});

test('Tool scalar application cannot write Lot, completion, or production credit fields', async () => {
  const source = read('services/apiScalarInventory.js');
  const start = source.indexOf('async function applyCurrentValue(');
  const end = source.indexOf('\nasync function ', start + 1);
  assert.ok(start >= 0 && end > start);
  const applyCurrentValue = vm.runInNewContext(`${source.slice(start, end)}\napplyCurrentValue`);
  const writes = [];
  const connection = { query: async (sql) => { writes.push(sql); } };

  for (const key of ['lot_id', 'lotId', 'unit_work_completion_id', 'credited_weight', 'production_weight']) {
    await applyCurrentValue(connection, 77, key, 999);
  }
  assert.deepEqual(writes, []);

  await applyCurrentValue(connection, 77, 'processor_speed_ghz', 3.4);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /UPDATE units SET processor_speed_ghz = \? WHERE unit_id = \?/);
});
