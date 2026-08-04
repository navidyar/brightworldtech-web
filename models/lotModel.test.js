'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const productionWeightModelPath = require.resolve('./productionWeightModel');
const lotModelPath = require.resolve('./lotModel');

function loadLotModelWithQueries(resultSets) {
  const queue = [...resultSets];
  const calls = [];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: {
        async query(sql, values = []) {
          calls.push({ sql, values });
          if (queue.length === 0) {
            throw new Error('Unexpected pool query.');
          }
          return queue.shift();
        }
      }
    }
  };

  require.cache[productionWeightModelPath] = {
    id: productionWeightModelPath,
    filename: productionWeightModelPath,
    loaded: true,
    exports: {}
  };

  delete require.cache[lotModelPath];

  return {
    lotModel: require('./lotModel'),
    calls
  };
}

test('deleteLotRequirement scopes deletion to both lot and requirement IDs', async () => {
  const { lotModel, calls } = loadLotModelWithQueries([
    [[{ columnName: 'lot_requirement_id' }, { columnName: 'lot_id' }]],
    [{ affectedRows: 1 }]
  ]);

  const deleted = await lotModel.deleteLotRequirement(7, 21);

  assert.equal(deleted, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /DELETE FROM lot_requirements/i);
  assert.match(calls[1].sql, /lot_id = \?/i);
  assert.match(calls[1].sql, /lot_requirement_id/i);
  assert.deepEqual(calls[1].values, [7, 21]);
});

test('deleteLotRequirement reports when no matching requirement was removed', async () => {
  const { lotModel } = loadLotModelWithQueries([
    [[{ columnName: 'lot_requirement_id' }, { columnName: 'lot_id' }]],
    [{ affectedRows: 0 }]
  ]);

  assert.equal(await lotModel.deleteLotRequirement(7, 99), false);
});

test('deleteLotRequirement rejects invalid identifiers without querying the database', async () => {
  const { lotModel, calls } = loadLotModelWithQueries([]);

  assert.equal(await lotModel.deleteLotRequirement(0, 1), false);
  assert.equal(await lotModel.deleteLotRequirement(1, -1), false);
  assert.equal(calls.length, 0);
});

test('listLotRequirements lets processor labels fall through past an empty model label', async () => {
  const { lotModel, calls } = loadLotModelWithQueries([
    [[{
      lot_requirement_id: 31,
      lot_id: 7,
      requirement_key: 'processor',
      operator_code: 'equals',
      processor_model_id: 21,
      requirement_number: null,
      required_value: 'Intel · Core · i5-8365U'
    }]]
  ]);

  const requirements = await lotModel.listLotRequirements(7);

  assert.equal(requirements[0].required_value, 'Intel · Core · i5-8365U');
  assert.equal(requirements[0].required_value_token, 'processor_model:21');

  const sql = calls[0].sql;
  const nullifiedConcatCount = (sql.match(/NULLIF\s*\(\s*CONCAT_WS/gi) || []).length;
  assert.ok(nullifiedConcatCount >= 2, 'model and processor CONCAT_WS expressions must return NULL when empty');
});

