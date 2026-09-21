'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('v1 functional diagnostics use only Pass, Fail, and confirmed physical absence while lock diagnostics use explicit Locked/Unlocked', () => {
  const diagnostics = read('services/apiHardwareDiagnosticsInventory.js');
  for (const state of ['pass', 'fail', 'physically_not_present']) {
    assert.match(diagnostics, new RegExp(`['\"]${state}['\"]`));
  }
  for (const retired of ['could_not_determine', 'not_tested', 'not_applicable', 'test_not_available', 'not_available']) {
    assert.doesNotMatch(diagnostics, new RegExp(`['\"]${retired}['\"]`));
  }
  assert.match(diagnostics, /if \(state === 'physically_not_present'\) return \['Physically Not Present'\]/);
  assert.match(diagnostics, /semantic === 'lock' && state === 'locked'/);
  assert.match(diagnostics, /semantic === 'lock' && state === 'unlocked'/);
});

test('Preflight derives unit_type requirements from the canonical top-level Unit Category', () => {
  const preflight = read('services/apiUnitPreflight.js');
  const values = read('services/apiUnitPreflightValues.js');
  assert.match(preflight, /buildCanonicalRequirementObservations\(body, \{/);
  assert.match(preflight, /includeUnitCategory: creatingNewUnit/);
  assert.match(values, /body\.unit_category_config_value_id \?\? body\.unitCategoryConfigValueId/);
  assert.match(values, /if \(includeUnitCategory\) addTopLevelRequirementContext\(body, observations\)/);
  assert.match(values, /observations\.set\('unit_type', normalizeObservation\(unitCategory\)\)/);
});

test('existing-Unit Commit uses canonical top-level system_uuid while retaining the legacy nested UUID only as compatibility input', () => {
  const inventory = read('services/apiScalarInventory.js');
  assert.match(inventory, /body\.system_uuid \?\? body\.systemUuid \?\? body\.uuid/);
  assert.match(inventory, /topLevelSystemUuid \|\| legacySecurityUuid/);
  assert.match(inventory, /SYSTEM_UUID_PAYLOAD_CONFLICT/);
  assert.match(inventory, /applyToolSystemUuidIdentifier/);
});

test('existing blank Unit and BIOS serial identifiers can be enriched but established conflicting values are rejected', () => {
  const model = read('models/techUnitModel.js');
  const inventory = read('services/apiScalarInventory.js');
  assert.match(model, /async function applyToolSerialIdentifier/);
  assert.match(model, /BWT_UNIT_SERIAL_IDENTITY_CONFLICT/);
  assert.match(model, /BWT_BIOS_SERIAL_IDENTITY_CONFLICT/);
  assert.match(model, /const differingCurrent = currentRows\.find/);
  assert.match(model, /return \{ status: 'applied', value: identifierValue, previousValue: null \}/);
  assert.doesNotMatch(model.match(/async function applyToolSerialIdentifier[\s\S]*?\n}\n\nasync function applyToolSystemUuidIdentifier/)?.[0] || '', /rejectOtherUnitMatch:\s*true/);
  assert.match(inventory, /applyToolSerialIdentifier\(connection, unitId, 'unit_serial_number'/);
  assert.match(inventory, /applyToolSerialIdentifier\(connection, unitId, 'bios_serial_number'/);
  assert.match(inventory, /UNIT_SERIAL_IDENTITY_CONFLICT/);
  assert.match(inventory, /BIOS_SERIAL_IDENTITY_CONFLICT/);
});

test('accepted identity enrichments are retained as Tool observations in the same inventory transaction', () => {
  const inventory = read('services/apiScalarInventory.js');
  assert.match(inventory, /for \(const identityResult of identityEnrichments\)/);
  assert.match(inventory, /identityResult\.fieldKey/);
  assert.match(inventory, /latest_valid_tool_identity_observation/);
  assert.match(inventory, /INSERT INTO unit_tool_observations/);
});


test('Test and Lock configuration expose only the settled canonical choices', () => {
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  const diagnostics = read('services/apiHardwareDiagnosticsInventory.js');
  assert.match(migration, /TEST_RESULTS[\s\S]*\['Pass', true\], \['Fail', true\], \['Physically Not Present', true\]/);
  assert.match(migration, /COMPONENT_TEST_RESULTS[\s\S]*\['Pass', true\], \['Fail', true\]/);
  assert.match(migration, /LOCK_STATUSES[\s\S]*\['Locked', true\], \['Unlocked', true\]/);
  for (const retired of ['Could Not Determine', 'Not Tested', 'Not Applicable', 'Test Not Available', 'Not Available']) {
    assert.equal(migration.includes(`['${retired}', true]`), false);
  }
  assert.match(diagnostics, /physically_not_present/);
});

test('missing Model and Processor values block Commit with the existing catalog-request path rather than being silently ignored', () => {
  const inventory = read('services/apiScalarInventory.js');
  assert.match(inventory, /MODEL_CATALOG_REQUEST_REQUIRED/);
  assert.match(inventory, /PROCESSOR_CATALOG_REQUEST_REQUIRED/);
  assert.match(inventory, /PROCESSOR_CONTEXT_UNRESOLVED/);
  assert.match(inventory, /\/api\/v1\/units\/catalog-requests\/model/);
  assert.match(inventory, /\/api\/v1\/units\/catalog-requests\/processor/);
});
