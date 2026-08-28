'use strict';

const UNIT_FIELD_SOURCE_KEY_MAPPINGS = Object.freeze([
  Object.freeze({ legacyKey: 'complete_diagnostics_status', canonicalKey: 'complete_diagnostics' }),
  Object.freeze({ legacyKey: 'virus_check_status', canonicalKey: 'virus_check' }),
  Object.freeze({ legacyKey: 'driver_check_status', canonicalKey: 'driver_check' })
]);

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function planUnitFieldSourceKeyMigration(rows = [], mappingsToPlan = UNIT_FIELD_SOURCE_KEY_MAPPINGS) {
  const keysByUnit = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const unitId = normalizePositiveInteger(row && (row.unitId ?? row.unit_id));
    const fieldKey = String(row && (row.fieldKey ?? row.field_key) || '').trim();
    if (!unitId || !fieldKey) continue;
    if (!keysByUnit.has(unitId)) keysByUnit.set(unitId, new Set());
    keysByUnit.get(unitId).add(fieldKey);
  }

  const mappings = (Array.isArray(mappingsToPlan) ? mappingsToPlan : UNIT_FIELD_SOURCE_KEY_MAPPINGS).map((mapping) => {
    let legacyRows = 0;
    let canonicalRows = 0;
    let collisions = 0;

    for (const keys of keysByUnit.values()) {
      const hasLegacy = keys.has(mapping.legacyKey);
      const hasCanonical = keys.has(mapping.canonicalKey);
      if (hasLegacy) legacyRows += 1;
      if (hasCanonical) canonicalRows += 1;
      if (hasLegacy && hasCanonical) collisions += 1;
    }

    return Object.freeze({
      ...mapping,
      legacyRows,
      canonicalRows,
      collisions,
      updatesPlanned: legacyRows - collisions
    });
  });

  return Object.freeze({
    rowsScanned: Array.isArray(rows) ? rows.length : 0,
    mappings: Object.freeze(mappings),
    collisions: mappings.reduce((sum, mapping) => sum + mapping.collisions, 0),
    updatesPlanned: mappings.reduce((sum, mapping) => sum + mapping.updatesPlanned, 0)
  });
}

module.exports = {
  UNIT_FIELD_SOURCE_KEY_MAPPINGS,
  planUnitFieldSourceKeyMigration
};
