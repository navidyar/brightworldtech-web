'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTechnicianActivityMap,
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
  assert.equal(check.actualValue, '16 GB');
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
  assert.match(check.message, /at most 128 GB; found 256 GB/i);
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
