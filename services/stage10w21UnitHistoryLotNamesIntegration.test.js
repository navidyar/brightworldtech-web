'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit audit snapshots recognize the Lot model lot_name property', () => {
  const source = read('services/unitAuditSnapshot.js');
  assert.match(source, /match\.shortLabel \|\| match\.label \|\| match\.name \|\| match\.lot_name/);
});

test('operational Lot history exposes IDs alongside names for legacy audit repair', () => {
  const source = read('models/techUnitModel.js');
  assert.match(source, /lotMoves:[\s\S]*fromLotId: normalizeOptionalInteger\(row\.from_lot_id\)[\s\S]*toLotId: normalizeOptionalInteger\(row\.to_lot_id\)/);
  assert.match(source, /lifecycleEvents:[\s\S]*fromLotId: normalizeOptionalInteger\(row\.from_lot_id\)[\s\S]*toLotId: normalizeOptionalInteger\(row\.to_lot_id\)/);
});

test('history timeline resolves numeric assignable_lot audit values through Lot history names', () => {
  const source = read('services/unitHistoryTimeline.js');
  assert.match(source, /function buildLotNameById\(/);
  assert.match(source, /normalizeText\(change\.fieldKey\) !== 'assignable_lot'/);
  assert.match(source, /normalizeAuditEvent\(event, \{ lotNameById \}\)/);
});
