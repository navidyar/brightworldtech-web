'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Lot-history migration preserves move snapshots and makes historical Lot references nullable on deletion', () => {
  const migration = read('scripts/migrateLotHistoryDeletion.js');

  for (const column of [
    'from_lot_id_snapshot',
    'to_lot_id_snapshot',
    'from_lot_name_snapshot',
    'to_lot_name_snapshot'
  ]) {
    assert.match(migration, new RegExp(column));
  }

  assert.match(migration, /ON DELETE SET NULL/);
  assert.match(migration, /h\.from_lot_id_snapshot = COALESCE\(h\.from_lot_id_snapshot, h\.from_lot_id\)/);
  assert.match(migration, /h\.to_lot_id_snapshot = COALESCE\(h\.to_lot_id_snapshot, h\.to_lot_id\)/);
  assert.match(migration, /h\.from_lot_name_snapshot = COALESCE\(h\.from_lot_name_snapshot, from_lot\.name\)/);
  assert.match(migration, /h\.to_lot_name_snapshot = COALESCE\(h\.to_lot_name_snapshot, to_lot\.name\)/);
});

test('Lot-history migration recreates same-named foreign keys in separate ALTER statements', () => {
  const migration = read('scripts/migrateLotHistoryDeletion.js');

  assert.match(migration, /await connection\.query\(replacement\.dropDdl\);/);
  assert.match(migration, /await connection\.query\(replacement\.addDdl\);/);
  assert.match(migration, /await connection\.query\(replacement\.restoreDdl\);/);
  assert.doesNotMatch(migration, /clauses\.push\(`DROP FOREIGN KEY/);
});

test('new Unit moves snapshot both Lot IDs and names at move time', () => {
  const model = read('models/productionCycleModel.js');

  assert.match(model, /hasHistoryFromLotIdSnapshot: historyColumns\.has\('from_lot_id_snapshot'\)/);
  assert.match(model, /hasHistoryToLotIdSnapshot: historyColumns\.has\('to_lot_id_snapshot'\)/);
  assert.match(model, /columns\.push\('from_lot_id_snapshot'\)[\s\S]*?values\.push\(safeFromLotId\)/);
  assert.match(model, /columns\.push\('to_lot_id_snapshot'\)[\s\S]*?values\.push\(safeToLotId\)/);
  assert.match(model, /getLotNameSnapshots\(\[safeFromLotId, safeToLotId\], connection\)/);
  assert.match(model, /columns\.push\('from_lot_name_snapshot'\)/);
  assert.match(model, /columns\.push\('to_lot_name_snapshot'\)/);
});

test('Unit History falls back to snapshots after a historical Lot is deleted', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /COALESCE\(h\.from_lot_id, h\.from_lot_id_snapshot\)/);
  assert.match(model, /COALESCE\(h\.to_lot_id, h\.to_lot_id_snapshot\)/);
  assert.match(model, /COALESCE\(NULLIF\(h\.from_lot_name_snapshot, ''\), from_lot\.name\)/);
  assert.match(model, /COALESCE\(NULLIF\(h\.to_lot_name_snapshot, ''\), to_lot\.name\)/);
});

test('Lot deletion still protects current Units and children and does not delete Lot-move history', () => {
  const model = read('models/lotModel.js');

  assert.match(model, /canDelete: unitCount === 0 && childLotCount === 0/);
  assert.doesNotMatch(model, /DELETE FROM unit_lot_history/);
});
