'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('shared Test Results are exactly Pass, Fail, and Physically Not Present', () => {
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  assert.match(migration, /TEST_RESULTS[\s\S]*?\['Pass', true\], \['Fail', true\], \['Physically Not Present', true\]/);
  for (const retired of ['Could Not Determine', 'Not Tested', 'Not Applicable', 'Test Not Available', 'Not Available']) {
    assert.doesNotMatch(migration, new RegExp(`\\['${retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', true\\]`));
  }
});

test('component tests and lock statuses no longer expose availability-style fallback states', () => {
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  assert.match(migration, /COMPONENT_TEST_RESULTS[\s\S]*?\['Pass', true\], \['Fail', true\]/);
  assert.match(migration, /LOCK_STATUSES[\s\S]*?\['Locked', true\], \['Unlocked', true\]/);
  assert.doesNotMatch(migration, /COMPONENT_TEST_RESULTS[\s\S]*?\['Not Available', true\]/);
  assert.doesNotMatch(migration, /LOCK_STATUSES[\s\S]*?\['Not Available', true\]/);
});

test('camera and biometrics use the Pass/Fail-only component result category', () => {
  const registry = read('config/configIdentityRegistry.js');
  const model = read('models/unitSpecsTestsModel.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const audit = read('services/unitAuditSnapshot.js');

  assert.match(registry, /COMPONENT_TEST_RESULTS:\s*36/);
  assert.doesNotMatch(registry, /AVAILABILITY_TEST_RESULTS/);
  assert.match(model, /SYSTEM_CONFIG_CATEGORY_IDS\.COMPONENT_TEST_RESULTS/);
  assert.match(model, /componentTestResultOptions/);
  assert.match(form, /data-unit-form-field-key="camera_test"[\s\S]*?componentTestResultOptions/);
  assert.match(form, /data-unit-form-field-key="biometrics_test"[\s\S]*?componentTestResultOptions/);
  assert.match(audit, /formatCameraRows[\s\S]*?'componentTestResultOptions'/);
  assert.match(audit, /formatBiometricRows[\s\S]*?'componentTestResultOptions'/);
});

test('canonical cleanup migration covers all agreed Tests & Checks categories and is audit-first', () => {
  const migration = read('scripts/migrateCanonicalTestCheckOptions.js');
  for (const category of [
    'TOUCHSCREEN_STATUSES',
    'DIAGNOSTICS_STATUSES',
    'VIRUS_CHECK_STATUSES',
    'DRIVER_CHECK_STATUSES',
    'TEST_RESULTS',
    'COMPONENT_TEST_RESULTS',
    'LOCK_STATUSES'
  ]) {
    assert.match(migration, new RegExp(`SYSTEM_CONFIG_CATEGORY_IDS\\.${category}`));
  }
  assert.match(migration, /No database changes were made\. Re-run with --apply/);
  assert.match(migration, /Retired Unit\/component references cleared/);
  assert.match(migration, /Retired Lot requirements deleted/);
  assert.match(migration, /validateCanonicalState/);
  assert.match(migration, /for \(const tableName of \['unit_cameras', 'unit_biometrics'\]\)/);
  assert.match(migration, /remapReferences\(connection, tableName, 'test_result_config_value_id'/);
});

test('Tool diagnostics reject retired uncertainty states and accept confirmed physical absence', () => {
  const diagnostics = read('services/apiHardwareDiagnosticsInventory.js');
  assert.match(diagnostics, /physically_not_present/);
  assert.match(diagnostics, /Physically Not Present/);
  for (const retired of ['could_not_determine', 'not_tested', 'not_applicable', 'test_not_available', 'not_available']) {
    assert.doesNotMatch(diagnostics, new RegExp(`['"]${retired}['"]`));
  }
});



test('BIOS and MDM Tool diagnostics reuse the existing Locked/Unlocked form fields', () => {
  const diagnostics = read('services/apiHardwareDiagnosticsInventory.js');
  const commit = read('services/apiUnitCommit.js');
  for (const field of ['bios_lock', 'mdm_lock']) {
    assert.match(diagnostics, new RegExp(`${field}_config_value_id`));
    assert.match(commit, new RegExp(`['\"]${field}['\"]`));
  }
  assert.match(diagnostics, /SYSTEM_CONFIG_CATEGORY_IDS\.LOCK_STATUSES/);
  assert.match(diagnostics, /semantic === 'lock' && state === 'locked'/);
  assert.match(diagnostics, /semantic === 'lock' && state === 'unlocked'/);
});

test('Creation Options exposes the separate component Pass/Fail result catalog', () => {
  const intake = read('services/apiUnitIntake.js');
  assert.match(intake, /test_results:\s*serializeConfigOptions\(expandedFormOptions\.testResultOptions\)/);
  assert.match(intake, /component_test_results:\s*serializeConfigOptions\(expandedFormOptions\.componentTestResultOptions\)/);
  assert.match(intake, /lock_statuses:\s*serializeConfigOptions\(expandedFormOptions\.lockStatusOptions\)/);
});

test('package exposes audit, migration, and targeted validation commands', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['audit:test-check-options'], 'node scripts/migrateCanonicalTestCheckOptions.js');
  assert.equal(packageJson.scripts['migrate:test-check-options'], 'node scripts/migrateCanonicalTestCheckOptions.js --apply');
  assert.match(packageJson.scripts['validate:test-check-options'], /apiCanonicalTestCheckOptions\.test\.js/);
  assert.match(packageJson.scripts['validate:test-check-options'], /apiHardwareDiagnosticsInventory\.test\.js/);
});
