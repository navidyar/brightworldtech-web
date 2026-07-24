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
