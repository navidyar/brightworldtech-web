'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UNIT_FIELD_SOURCE_KEY_MAPPINGS,
  planUnitFieldSourceKeyMigration
} = require('./unitFieldSourceKeyMigration');

test('plans the three confirmed legacy Unit field-source keys without altering canonical rows', () => {
  const rows = [
    { unit_id: 10, field_key: 'complete_diagnostics_status' },
    { unit_id: 10, field_key: 'virus_check_status' },
    { unit_id: 10, field_key: 'driver_check_status' },
    { unit_id: 11, field_key: 'complete_diagnostics' }
  ];
  const plan = planUnitFieldSourceKeyMigration(rows);

  assert.equal(UNIT_FIELD_SOURCE_KEY_MAPPINGS.length, 3);
  assert.equal(plan.rowsScanned, 4);
  assert.equal(plan.updatesPlanned, 3);
  assert.equal(plan.collisions, 0);
  assert.equal(plan.mappings[0].canonicalRows, 1);
});

test('canonical collisions block an in-place key update', () => {
  const plan = planUnitFieldSourceKeyMigration([
    { unitId: 10, fieldKey: 'virus_check_status' },
    { unitId: 10, fieldKey: 'virus_check' }
  ]);

  assert.equal(plan.collisions, 1);
  assert.equal(plan.updatesPlanned, 0);
});

test('the same guarded planner supports an explicit rollback direction', () => {
  const rollbackMappings = UNIT_FIELD_SOURCE_KEY_MAPPINGS.map(({ legacyKey, canonicalKey }) => ({
    legacyKey: canonicalKey,
    canonicalKey: legacyKey
  }));
  const plan = planUnitFieldSourceKeyMigration([
    { unit_id: 8, field_key: 'complete_diagnostics' }
  ], rollbackMappings);

  assert.equal(plan.updatesPlanned, 1);
  assert.equal(plan.collisions, 0);
  assert.equal(plan.mappings[0].legacyKey, 'complete_diagnostics');
  assert.equal(plan.mappings[0].canonicalKey, 'complete_diagnostics_status');
});
