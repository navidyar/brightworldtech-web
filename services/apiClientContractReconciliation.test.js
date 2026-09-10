'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('v1 diagnostics accept all approved final functional-test states without reducing them to Pass/Fail', () => {
  const diagnostics = read('services/apiHardwareDiagnosticsInventory.js');
  for (const state of ['pass', 'fail', 'could_not_determine', 'not_tested', 'not_applicable', 'test_not_available']) {
    assert.match(diagnostics, new RegExp(`['\"]${state}['\"]`));
  }
  assert.match(diagnostics, /if \(state === 'could_not_determine'\) return \['Could Not Determine'\]/);
  assert.match(diagnostics, /if \(state === 'not_tested'\) return \['Not Tested'\]/);
  assert.match(diagnostics, /if \(state === 'test_not_available'\) return \['Test Not Available'\]/);
});

test('Preflight derives unit_type requirements from the canonical top-level Unit Category', () => {
  const preflight = read('services/apiUnitPreflight.js');
  const values = read('services/apiUnitPreflightValues.js');
  assert.match(preflight, /addTopLevelRequirementContext\(body, normalizeDetectedValues\(body\)\)/);
  assert.match(values, /body\.unit_category_config_value_id \?\? body\.unitCategoryConfigValueId/);
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
