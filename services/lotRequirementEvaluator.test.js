'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAssignedTechnician,
  buildTechnicianActivityMap,
  buildTechnicianDisplaySummary,
  buildTechnicianSummary,
  buildUnitSnapshots,
  ensureAssetTagPrefix,
  evaluateRequirement,
  evaluateUnitSnapshot,
  formatAssetTag
} = require('./lotRequirementEvaluator');

function buildSampleSnapshot(overrides = {}) {
  const [snapshot] = buildUnitSnapshots({
    baseRows: [{
      unit_id: 10,
      asset_number: 1234,
      unit_category_config_value_id: 7,
      unit_category_label: 'Laptop',
      manufacturer_id: 1,
      manufacturer_name: 'Dell',
      unit_model_id: 40,
      model_name: 'Latitude 5400',
      model_display_label: 'Dell Latitude 5400',
      processor_model_id: 55,
      processor_display_label: 'Intel Core i5-8365U',
      ram_gb: 8,
      ram_type_config_value_id: 70,
      ram_type_label: 'DDR4',
      storage_gb: 256,
      storage_type_config_value_id: 80,
      storage_type_label: 'NVMe',
      ...overrides
    }],
    identifierRows: [{
      unit_id: 10,
      identifier_type_code: 'unit_serial_number',
      identifier_value: 'ABC123',
      is_primary: 0
    }]
  });

  return snapshot;
}

function requirement(overrides = {}) {
  return {
    lot_requirement_id: 1,
    requirement_key: 'manufacturer',
    requirement_label: 'Manufacturer',
    operator_code: 'equals',
    operator_label: 'Must equal',
    manufacturer_id: 1,
    required_value: 'Dell',
    is_active: 1,
    ...overrides
  };
}

test('asset number provides a stable primary display even without identifier rows', () => {
  const snapshot = buildSampleSnapshot();

  assert.equal(snapshot.label, 'BWT1234');
  assert.match(snapshot.subLabel, /Unit Serial: ABC123/);
  assert.equal(formatAssetTag(99, 'TAG-'), 'TAG-99');
});


test('asset tag identifiers always display with one BWT prefix', () => {
  const [numericIdentifier] = buildUnitSnapshots({
    baseRows: [{ unit_id: 1, asset_number: 5 }],
    identifierRows: [{
      unit_id: 1,
      identifier_type_code: 'asset_tag',
      identifier_value: '2300006',
      is_primary: 1
    }]
  });
  const [alreadyPrefixed] = buildUnitSnapshots({
    baseRows: [{ unit_id: 2, asset_number: 6 }],
    identifierRows: [{
      unit_id: 2,
      identifier_type_code: 'asset_tag',
      identifier_value: 'bwt2300007',
      is_primary: 1
    }]
  });

  assert.equal(numericIdentifier.label, 'BWT2300006');
  assert.equal(alreadyPrefixed.label, 'BWT2300007');
  assert.equal(ensureAssetTagPrefix('BWT-2300008'), 'BWT2300008');
});

test('technician activity combines completion and work-session records by technician', () => {
  const techniciansByUnit = buildTechnicianActivityMap([
    {
      unit_id: 10,
      user_id: 7,
      first_name: 'Alex',
      last_name: 'Tech',
      activity_type: 'work_session',
      activity_at: '2026-07-01T10:00:00Z'
    },
    {
      unit_id: 10,
      user_id: 7,
      first_name: 'Alex',
      last_name: 'Tech',
      activity_type: 'completion',
      activity_at: '2026-07-01T11:00:00Z'
    },
    {
      unit_id: 10,
      user_id: 8,
      first_name: 'Sam',
      last_name: 'Lead',
      activity_type: 'work_session',
      activity_at: '2026-07-01T12:00:00Z'
    }
  ]);
  const technicians = techniciansByUnit.get(10);

  assert.equal(technicians.length, 2);
  assert.equal(technicians[0].displayName, 'Alex Tech');
  assert.equal(technicians[0].completedUnit, true);
  assert.equal(technicians[0].workSessionCount, 1);
  assert.equal(buildTechnicianSummary(technicians), 'Alex Tech, Sam Lead');
  assert.equal(buildTechnicianSummary([]), 'No technician activity recorded');
});

test('current assignment is displayed even when no technician activity exists', () => {
  const assignedTechnician = buildAssignedTechnician({
    assigned_to_user_id: 12,
    assigned_first_name: 'Jordan',
    assigned_last_name: 'Tech',
    assigned_email: 'jordan@example.com'
  });

  assert.deepEqual(assignedTechnician, {
    userId: 12,
    displayName: 'Jordan Tech'
  });
  assert.equal(buildTechnicianDisplaySummary(assignedTechnician, []), 'Jordan Tech');
});

test('current assignment remains primary when another technician has activity', () => {
  const summary = buildTechnicianDisplaySummary(
    { userId: 12, displayName: 'Jordan Tech' },
    [
      { userId: 12, displayName: 'Jordan Tech' },
      { userId: 15, displayName: 'Alex Lead' }
    ]
  );

  assert.equal(summary, 'Jordan Tech (assigned); activity by Alex Lead');
});

test('new and legacy serial type codes normalize into the same identity fields', () => {
  const [snapshot] = buildUnitSnapshots({
    baseRows: [{ unit_id: 1, asset_number: 5 }],
    identifierRows: [
      { unit_id: 1, identifier_type_code: 'unit_serial', identifier_value: 'UNIT-1' },
      { unit_id: 1, identifier_type_code: 'bios_serial_number', identifier_value: 'BIOS-1' }
    ]
  });

  assert.equal(snapshot.unitSerial, 'UNIT-1');
  assert.equal(snapshot.biosSerial, 'BIOS-1');
});

test('current memory modules override the legacy unit summary and are totaled', () => {
  const [snapshot] = buildUnitSnapshots({
    baseRows: [{ unit_id: 1, asset_number: 5, ram_gb: 4, ram_type_config_value_id: 70, ram_type_label: 'DDR3' }],
    memoryRows: [
      { unit_id: 1, size_gb: 8, ram_type_config_value_id: 71, ram_type_label: 'DDR4' },
      { unit_id: 1, size_gb: 8, ram_type_config_value_id: 71, ram_type_label: 'DDR4' }
    ]
  });

  assert.equal(snapshot.valuesByKey.ram_gb.numberValue, 16);
  assert.deepEqual(snapshot.valuesByKey.ram_type.ids, [71]);
  assert.equal(snapshot.valuesByKey.ram_gb.sourceLabel, 'Current memory modules');
});

test('explicit zero-size current rows override stale summaries without exposing a type', () => {
  const [snapshot] = buildUnitSnapshots({
    baseRows: [{ unit_id: 1, asset_number: 5, ram_gb: 16, ram_type_config_value_id: 70, ram_type_label: 'DDR4', storage_gb: 512, storage_type_config_value_id: 80, storage_type_label: 'NVMe' }],
    memoryRows: [{ unit_id: 1, size_gb: 0, ram_type_config_value_id: null, ram_type_label: null }],
    storageRows: [{ unit_id: 1, size_gb: 0, storage_type_config_value_id: null, storage_type_label: null }]
  });

  assert.equal(snapshot.valuesByKey.ram_gb.numberValue, 0);
  assert.deepEqual(snapshot.valuesByKey.ram_type.ids, []);
  assert.equal(snapshot.valuesByKey.storage_gb.numberValue, 0);
  assert.deepEqual(snapshot.valuesByKey.storage_type.ids, []);
});

test('current storage devices are totaled and expose all current types', () => {
  const [snapshot] = buildUnitSnapshots({
    baseRows: [{ unit_id: 1, asset_number: 5, storage_gb: 64 }],
    storageRows: [
      { unit_id: 1, size_gb: 256, storage_type_config_value_id: 80, storage_type_label: 'NVMe' },
      { unit_id: 1, size_gb: 500, storage_type_config_value_id: 81, storage_type_label: 'SATA' }
    ]
  });

  assert.equal(snapshot.valuesByKey.storage_gb.numberValue, 756);
  assert.deepEqual(snapshot.valuesByKey.storage_type.ids, [80, 81]);
});

test('catalog requirements compare by stored IDs rather than display text', () => {
  const check = evaluateRequirement(buildSampleSnapshot(), requirement({
    required_value: 'DELL CORPORATION'
  }));

  assert.equal(check.status, 'accepted');
});

test('missing catalog values reject the unit instead of becoming an unsupported review', () => {
  const check = evaluateRequirement(
    buildSampleSnapshot({ manufacturer_id: null, manufacturer_name: null }),
    requirement()
  );

  assert.equal(check.status, 'rejected');
  assert.match(check.message, /no recorded manufacturer/i);
});

test('incomplete legacy requirements are marked needs review', () => {
  const check = evaluateRequirement(buildSampleSnapshot(), requirement({ manufacturer_id: null }));

  assert.equal(check.status, 'needs_review');
  assert.match(check.message, /missing its configured catalog value/i);
});

test('numeric minimum requirements use normalized module totals', () => {
  const [snapshot] = buildUnitSnapshots({
    baseRows: [{ unit_id: 1, asset_number: 5, ram_gb: 4 }],
    memoryRows: [
      { unit_id: 1, size_gb: 8 },
      { unit_id: 1, size_gb: 8 }
    ]
  });
  const check = evaluateRequirement(snapshot, requirement({
    requirement_key: 'ram_gb',
    requirement_label: 'Memory Size',
    operator_code: 'greater_equal',
    operator_label: 'Minimum',
    manufacturer_id: null,
    requirement_number: 16,
    required_value: '16'
  }));

  assert.equal(check.status, 'accepted');
  assert.equal(check.actualValue, '16GB');
});

test('numeric maximum failures explain expected and actual values', () => {
  const check = evaluateRequirement(buildSampleSnapshot(), requirement({
    requirement_key: 'storage_gb',
    requirement_label: 'Storage Size',
    operator_code: 'less_equal',
    operator_label: 'Maximum',
    manufacturer_id: null,
    requirement_number: 128,
    required_value: '128'
  }));

  assert.equal(check.status, 'rejected');
  assert.match(check.message, /at most 128GB; found 256GB/i);
});

test('unit status prioritizes rejected checks over review checks', () => {
  const snapshot = buildSampleSnapshot({ manufacturer_id: null, manufacturer_name: null });
  const evaluated = evaluateUnitSnapshot(snapshot, [
    requirement(),
    requirement({
      lot_requirement_id: 2,
      requirement_key: 'model',
      requirement_label: 'Model',
      manufacturer_id: null,
      unit_model_id: null,
      required_value: ''
    })
  ]);

  assert.equal(evaluated.status, 'rejected');
  assert.equal(evaluated.failedChecks.length, 1);
  assert.equal(evaluated.reviewChecks.length, 1);
});

test('multiple values for the same catalog field are accepted with OR logic', () => {
  const evaluated = evaluateUnitSnapshot(buildSampleSnapshot(), [
    requirement(),
    requirement({
      lot_requirement_id: 2,
      manufacturer_id: 2,
      required_value: 'Microsoft'
    })
  ]);

  assert.equal(evaluated.status, 'accepted');
  assert.equal(evaluated.requirementCount, 2);
  assert.equal(evaluated.requirementGroupCount, 1);
  assert.equal(evaluated.checks.length, 1);
  assert.equal(evaluated.checks[0].operatorLabel, 'Must equal one of');
  assert.equal(evaluated.checks[0].requiredValue, 'Dell or Microsoft');
  assert.deepEqual(evaluated.checks[0].requirementIds, [1, 2]);
});

test('a catalog value outside every same-field alternative is rejected', () => {
  const evaluated = evaluateUnitSnapshot(
    buildSampleSnapshot({ manufacturer_id: 3, manufacturer_name: 'Lenovo' }),
    [
      requirement(),
      requirement({
        lot_requirement_id: 2,
        manufacturer_id: 2,
        required_value: 'Microsoft'
      })
    ]
  );

  assert.equal(evaluated.status, 'rejected');
  assert.equal(evaluated.failedChecks.length, 1);
  assert.match(evaluated.failedChecks[0].message, /Dell or Microsoft/i);
});

test('requirements for different fields continue to use AND logic', () => {
  const evaluated = evaluateUnitSnapshot(buildSampleSnapshot(), [
    requirement(),
    requirement({
      lot_requirement_id: 2,
      requirement_key: 'model',
      requirement_label: 'Model',
      manufacturer_id: null,
      unit_model_id: 41,
      required_value: 'Dell Latitude 5410'
    })
  ]);

  assert.equal(evaluated.requirementGroupCount, 2);
  assert.equal(evaluated.status, 'rejected');
  assert.equal(evaluated.failedChecks.length, 1);
  assert.equal(evaluated.failedChecks[0].requirementKey, 'model');
});

test('multiple numeric equals rules are alternatives while range rules remain cumulative', () => {
  const memoryEqualsEight = requirement({
    lot_requirement_id: 1,
    requirement_key: 'ram_gb',
    requirement_label: 'Memory Size',
    operator_code: 'equals',
    operator_label: 'Must equal',
    manufacturer_id: null,
    requirement_number: 8,
    required_value: '8'
  });
  const memoryEqualsSixteen = requirement({
    lot_requirement_id: 2,
    requirement_key: 'ram_gb',
    requirement_label: 'Memory Size',
    operator_code: 'equals',
    operator_label: 'Must equal',
    manufacturer_id: null,
    requirement_number: 16,
    required_value: '16'
  });
  const memoryMinimum = requirement({
    lot_requirement_id: 3,
    requirement_key: 'ram_gb',
    requirement_label: 'Memory Size',
    operator_code: 'greater_equal',
    operator_label: 'Minimum',
    manufacturer_id: null,
    requirement_number: 8,
    required_value: '8'
  });
  const memoryMaximum = requirement({
    lot_requirement_id: 4,
    requirement_key: 'ram_gb',
    requirement_label: 'Memory Size',
    operator_code: 'less_equal',
    operator_label: 'Maximum',
    manufacturer_id: null,
    requirement_number: 16,
    required_value: '16'
  });

  const accepted = evaluateUnitSnapshot(
    buildSampleSnapshot({ ram_gb: 16 }),
    [memoryEqualsEight, memoryEqualsSixteen, memoryMinimum, memoryMaximum]
  );
  const rejected = evaluateUnitSnapshot(
    buildSampleSnapshot({ ram_gb: 12 }),
    [memoryEqualsEight, memoryEqualsSixteen, memoryMinimum, memoryMaximum]
  );

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.checks.length, 1);
  assert.match(accepted.checks[0].requiredValue, /8GB or 16GB/i);
  assert.equal(rejected.status, 'rejected');
});


test('Processor Family requirements accept any processor explicitly assigned to the family', () => {
  const snapshot = buildSampleSnapshot({
    processor_family_ids: '18,22',
    processor_family_labels: 'Intel i5-8th Gen||Business Laptop Processors'
  });
  const evaluated = evaluateUnitSnapshot(snapshot, [requirement({
    requirement_key: 'processor_family',
    requirement_label: 'Processor Family',
    manufacturer_id: null,
    processor_family_id: 18,
    required_value: 'Intel i5-8th Gen'
  })]);

  assert.equal(evaluated.status, 'accepted');
  assert.equal(evaluated.checks[0].actualValue, 'Intel i5-8th Gen, Business Laptop Processors');
});

test('specific Processor and Processor Family requirements share OR logic', () => {
  const snapshot = buildSampleSnapshot({
    processor_family_ids: '18',
    processor_family_labels: 'Intel i5-8th Gen'
  });
  const evaluated = evaluateUnitSnapshot(snapshot, [
    requirement({
      requirement_key: 'processor',
      requirement_label: 'Processor',
      manufacturer_id: null,
      processor_model_id: 999,
      required_value: 'Intel Core i7-8650U'
    }),
    requirement({
      lot_requirement_id: 2,
      requirement_key: 'processor_family',
      requirement_label: 'Processor Family',
      manufacturer_id: null,
      processor_family_id: 18,
      required_value: 'Intel i5-8th Gen'
    })
  ]);

  assert.equal(evaluated.status, 'accepted');
  assert.equal(evaluated.requirementGroupCount, 1);
  assert.equal(evaluated.checks[0].requirementLabel, 'Processor or Processor Family');
  assert.equal(evaluated.checks[0].operatorLabel, 'Must equal one of');
});

test('Processor Family requirements reject processors outside the configured family', () => {
  const snapshot = buildSampleSnapshot({
    processor_family_ids: '18',
    processor_family_labels: 'Intel i5-8th Gen'
  });
  const evaluated = evaluateUnitSnapshot(snapshot, [requirement({
    requirement_key: 'processor_family',
    requirement_label: 'Processor Family',
    manufacturer_id: null,
    processor_family_id: 29,
    required_value: 'Intel i5-12th Gen'
  })]);

  assert.equal(evaluated.status, 'rejected');
  assert.match(evaluated.failedChecks[0].message, /Intel i5-12th Gen/);
});
