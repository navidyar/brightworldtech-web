'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getEffectiveUnitFormProfileForLot,
  getLotLineage,
  listRulesForLotLineage
} = require('./lotUnitFormProfileModel');

function createQueuedConnection(resultSets) {
  const queue = [...resultSets];
  const calls = [];

  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (queue.length === 0) {
        throw new Error('Unexpected query.');
      }

      return [queue.shift()];
    }
  };
}

test('database lineage rows are returned root-to-selected', async () => {
  const connection = createQueuedConnection([[
    { lot_id: 30, parent_lot_id: 20, name: 'Leaf', ancestry_depth: 0, cycle_detected: 0 },
    { lot_id: 20, parent_lot_id: 10, name: 'Child', ancestry_depth: 1, cycle_detected: 0 },
    { lot_id: 10, parent_lot_id: null, name: 'Root', ancestry_depth: 2, cycle_detected: 0 }
  ]]);

  const lineage = await getLotLineage(30, connection);

  assert.deepEqual(lineage, [
    { lotId: 10, parentLotId: null, name: 'Root' },
    { lotId: 20, parentLotId: 10, name: 'Child' },
    { lotId: 30, parentLotId: 20, name: 'Leaf' }
  ]);
  assert.deepEqual(connection.calls[0].values, [30, 100]);
});

test('database lineage rejects a detected hierarchy cycle', async () => {
  const connection = createQueuedConnection([[
    { lot_id: 20, parent_lot_id: 10, name: 'Child', ancestry_depth: 0, cycle_detected: 0 },
    { lot_id: 10, parent_lot_id: 20, name: 'Root', ancestry_depth: 1, cycle_detected: 0 },
    { lot_id: 20, parent_lot_id: 10, name: 'Child', ancestry_depth: 2, cycle_detected: 1 }
  ]]);

  await assert.rejects(
    () => getLotLineage(20, connection),
    (error) => error.code === 'LOT_HIERARCHY_CYCLE'
  );
});

test('database rules map into the pure resolver and retain inheritance sources', async () => {
  const lineage = [
    { lotId: 10, parentLotId: null, name: 'Root' },
    { lotId: 20, parentLotId: 10, name: 'Child' }
  ];
  const connection = createQueuedConnection([[
    {
      lot_unit_form_field_rule_id: 1,
      lot_id: 10,
      field_key: 'bios_serial_number',
      visibility_mode: 'inherit',
      requirement_mode: 'required',
      created_by_user_id: 1,
      updated_by_user_id: 1,
      created_at: new Date('2026-07-22T12:00:00Z'),
      updated_at: new Date('2026-07-22T12:00:00Z')
    },
    {
      lot_unit_form_field_rule_id: 2,
      lot_id: 20,
      field_key: 'bios_serial_number',
      visibility_mode: 'hidden',
      requirement_mode: 'inherit',
      created_by_user_id: 1,
      updated_by_user_id: 1,
      created_at: new Date('2026-07-22T12:00:00Z'),
      updated_at: new Date('2026-07-22T12:00:00Z')
    }
  ]]);

  const rules = await listRulesForLotLineage(lineage, connection);

  assert.equal(rules.length, 2);
  assert.deepEqual(connection.calls[0].values, [10, 20, 10, 20]);

  const profileConnection = createQueuedConnection([
    [
      { lot_id: 20, parent_lot_id: 10, name: 'Child', ancestry_depth: 0, cycle_detected: 0 },
      { lot_id: 10, parent_lot_id: null, name: 'Root', ancestry_depth: 1, cycle_detected: 0 }
    ],
    [
      {
        lot_unit_form_field_rule_id: 1,
        lot_id: 10,
        field_key: 'bios_serial_number',
        visibility_mode: 'inherit',
        requirement_mode: 'required',
        created_by_user_id: 1,
        updated_by_user_id: 1,
        created_at: null,
        updated_at: null
      },
      {
        lot_unit_form_field_rule_id: 2,
        lot_id: 20,
        field_key: 'bios_serial_number',
        visibility_mode: 'hidden',
        requirement_mode: 'inherit',
        created_by_user_id: 1,
        updated_by_user_id: 1,
        created_at: null,
        updated_at: null
      }
    ]
  ]);

  const profile = await getEffectiveUnitFormProfileForLot(20, profileConnection);
  const bios = profile.fieldsByKey.get('bios_serial_number');

  assert.equal(bios.visible, false);
  assert.equal(bios.required, false);
  assert.equal(bios.requiredSuppressedByHidden, true);
  assert.equal(bios.visibilitySource.lotId, 20);
  assert.equal(bios.requirementSource.lotId, 10);
});

test('lists direct rules for one Lot without loading its ancestors', async () => {
  const connection = createQueuedConnection([[
    {
      lot_unit_form_field_rule_id: 9,
      lot_id: 20,
      field_key: 'bios_serial_number',
      visibility_mode: 'visible',
      requirement_mode: 'required',
      created_by_user_id: 1,
      updated_by_user_id: 2,
      created_at: null,
      updated_at: null
    }
  ]]);
  const { listRulesForLot } = require('./lotUnitFormProfileModel');
  const rules = await listRulesForLot(20, connection);

  assert.equal(rules.length, 1);
  assert.equal(rules[0].lotId, 20);
  assert.equal(rules[0].fieldKey, 'bios_serial_number');
  assert.deepEqual(connection.calls[0].values, [20]);
});

test('replaces direct Lot rules while retaining inherited parent rules in the resolved profile', async () => {
  const connection = createQueuedConnection([
    [{ lot_id: 20 }],
    [
      { lot_id: 20, parent_lot_id: 10, name: 'Child', ancestry_depth: 0, cycle_detected: 0 },
      { lot_id: 10, parent_lot_id: null, name: 'Root', ancestry_depth: 1, cycle_detected: 0 }
    ],
    [
      {
        lot_unit_form_field_rule_id: 1,
        lot_id: 10,
        field_key: 'bios_serial_number',
        visibility_mode: 'inherit',
        requirement_mode: 'required',
        created_by_user_id: 1,
        updated_by_user_id: 1,
        created_at: null,
        updated_at: null
      },
      {
        lot_unit_form_field_rule_id: 2,
        lot_id: 20,
        field_key: 'unit_serial_number',
        visibility_mode: 'hidden',
        requirement_mode: 'inherit',
        created_by_user_id: 1,
        updated_by_user_id: 1,
        created_at: null,
        updated_at: null
      }
    ],
    { affectedRows: 1 },
    { affectedRows: 2 }
  ]);
  const { replaceRulesForLot } = require('./lotUnitFormProfileModel');
  const result = await replaceRulesForLot(20, [
    {
      fieldKey: 'bios_serial_number',
      visibilityMode: 'visible',
      requirementMode: 'inherit'
    },
    {
      fieldKey: 'manufacturer',
      visibilityMode: 'hidden',
      requirementMode: 'optional'
    }
  ], 7, connection);

  assert.equal(result.savedRuleCount, 2);
  assert.equal(result.profile.fieldsByKey.get('bios_serial_number').required, true);
  assert.equal(result.profile.fieldsByKey.get('bios_serial_number').visibilitySource.lotId, 20);
  assert.match(connection.calls[3].sql, /field_key NOT IN/);
  assert.deepEqual(connection.calls[3].values, [20, 'bios_serial_number', 'manufacturer']);
  assert.match(connection.calls[4].sql, /ON DUPLICATE KEY UPDATE/);
});

test('removes all direct rules when every field returns to Inherit', async () => {
  const connection = createQueuedConnection([
    [{ lot_id: 20 }],
    [{ lot_id: 20, parent_lot_id: null, name: 'Root', ancestry_depth: 0, cycle_detected: 0 }],
    [],
    { affectedRows: 3 }
  ]);
  const { replaceRulesForLot } = require('./lotUnitFormProfileModel');
  const result = await replaceRulesForLot(20, [], 7, connection);

  assert.equal(result.savedRuleCount, 0);
  assert.match(connection.calls[3].sql, /WHERE lot_id = \?/);
  assert.deepEqual(connection.calls[3].values, [20]);
});
