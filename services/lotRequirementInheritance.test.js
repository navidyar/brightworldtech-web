'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEffectiveLotRequirements } = require('./lotRequirementInheritance');

test('grandchild Lots inherit only direct-parent requirements, never grandparent requirements', () => {
  const requirements = buildEffectiveLotRequirements({
    lineage: [
      { lotId: 10, name: 'Grandparent' },
      { lotId: 20, name: 'Parent' },
      { lotId: 30, name: 'Grandchild' }
    ],
    requirementGroups: [
      [{ lot_requirement_id: 1, requirement_key: 'ram_gb' }],
      [{ lot_requirement_id: 2, requirement_key: 'storage_gb' }],
      [{ lot_requirement_id: 3, requirement_key: 'battery_health' }]
    ],
    selectedLotId: 30
  });

  assert.deepEqual(
    requirements.map((row) => ({
      id: row.lot_requirement_id,
      source: row.source_lot_name,
      inherited: row.is_inherited,
      depth: row.inheritance_depth
    })),
    [
      { id: 2, source: 'Parent', inherited: 1, depth: 1 },
      { id: 3, source: 'Grandchild', inherited: 0, depth: 0 }
    ]
  );
});

test('a child direct requirement replaces all direct-parent rules for the same field', () => {
  const requirements = buildEffectiveLotRequirements({
    lineage: [
      { lotId: 10, name: 'Parent' },
      { lotId: 20, name: 'Child' }
    ],
    requirementGroups: [
      [
        { lot_requirement_id: 1, requirement_key: 'model', required_value: 'Latitude 5400' },
        { lot_requirement_id: 2, requirement_key: 'model', required_value: 'Latitude 5410' },
        { lot_requirement_id: 3, requirement_key: 'ram_gb', required_value: '16' }
      ],
      [
        { lot_requirement_id: 4, requirement_key: 'model', required_value: 'Latitude 7420' }
      ]
    ],
    selectedLotId: 20
  });

  assert.deepEqual(
    requirements.map((row) => ({ id: row.lot_requirement_id, inherited: row.is_inherited })),
    [
      { id: 3, inherited: 1 },
      { id: 4, inherited: 0 }
    ]
  );
});

test('a child with no direct rule for a field continues to inherit the parent field', () => {
  const requirements = buildEffectiveLotRequirements({
    lineage: [
      { lotId: 10, name: 'Parent' },
      { lotId: 20, name: 'Child' }
    ],
    requirementGroups: [
      [{ lot_requirement_id: 1, requirement_key: 'manufacturer' }],
      []
    ],
    selectedLotId: 20
  });

  assert.equal(requirements.length, 1);
  assert.equal(requirements[0].lot_requirement_id, 1);
  assert.equal(requirements[0].is_inherited, 1);
  assert.equal(requirements[0].source_lot_name, 'Parent');
});

test('inheritance rejects a mismatched lineage/group shape', () => {
  assert.throws(
    () => buildEffectiveLotRequirements({
      lineage: [{ lotId: 1, name: 'Parent' }, { lotId: 2, name: 'Child' }],
      requirementGroups: [[]],
      selectedLotId: 2
    }),
    /groups must match/i
  );
});
