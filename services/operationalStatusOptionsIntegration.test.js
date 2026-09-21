'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('remaining operational option cleanup encodes the settled canonical choices', () => {
  const migration = read('scripts/migrateOperationalStatusOptions.js');
  assert.match(migration, /Storage Wipe Status: Wiped, Not Wiped, Wipe Failed/);
  assert.match(migration, /Absolute Status: existing meaningful states plus Unavailable/);
  assert.match(migration, /Skinning Status: Arrived Skinned, Skinned by BWT, Not Skinned/);
  assert.match(migration, /retired: Object\.freeze\(\['Unknown', 'N\/A'\]\)/);
  assert.match(migration, /remapToUnavailable: Object\.freeze\(\['Unknown'\]\)/);
  assert.match(migration, /unavailableAliases: Object\.freeze\(\['Unavailable', 'Not Detected'\]\)/);
});

test('development cleanup removes ambiguous old Skinning values instead of preserving compatibility', () => {
  const migration = read('scripts/migrateOperationalStatusOptions.js');
  assert.match(migration, /Existing values to retire/);
  assert.match(migration, /clearReferences\(connection, 'unit_specifications', 'skinned_status_config_value_id', oldSkinnedIds\)/);
  assert.match(migration, /deleteLotRequirements\(connection, oldSkinnedIds\)/);
  assert.match(migration, /deactivateValues\(connection, oldSkinnedIds\)/);
  assert.doesNotMatch(migration, /Arrived Skinned.*aliases.*Yes/i);
});

test('Skinned by BWT has explicit actor and timestamp persistence', () => {
  const migration = read('scripts/migrateOperationalStatusOptions.js');
  const model = read('models/unitExpandedFormModel.js');
  assert.match(migration, /ADD COLUMN skinned_by_user_id/);
  assert.match(migration, /ADD COLUMN skinned_at DATETIME NULL/);
  assert.match(migration, /FOREIGN KEY \(skinned_by_user_id\) REFERENCES users \(user_id\) ON DELETE SET NULL/);
  assert.match(model, /String\(selected\?\.label \|\| ''\).*=== 'skinned by bwt'/s);
  assert.match(model, /SET skinned_by_user_id = \?, skinned_at = CURRENT_TIMESTAMP/);
  assert.match(model, /SET skinned_by_user_id = NULL, skinned_at = NULL/);
  assert.match(model, /action: 'preserve'/);
});

test('Skinning attribution is visible in Unit details while the form uses the clarified field label', () => {
  const detailModel = read('models/unitExpandedDetailModel.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(form, /data-unit-form-field-key="skinned_status"><span>Skinning Status<\/span>/);
  assert.match(detailModel, /us\.skinned_at/);
  assert.match(detailModel, /LEFT JOIN users skinned_by/);
  assert.match(detailModel, /skinnedByName: getPersonName\(row, 'skinned_by'\)/);
  assert.match(table, /<dt>Skinning Status<\/dt>/);
  assert.match(table, /specifications\.skinnedByName/);
  assert.match(table, /formatDateTime\(specifications\.skinnedAt\)/);
});

test('Absolute Tool input maps only confirmed unavailability to the Unavailable form status', () => {
  const inventory = read('services/apiConnectivitySecurityPowerInventory.js');
  assert.match(inventory, /\['unavailable', 'not_available', 'not_detected', 'not_present'\]\.includes\(token\).*return 'Unavailable'/s);
  assert.match(inventory, /\['unknown', 'not_tested', 'not_run', 'unsupported', 'not_applicable', 'n\/a', 'could_not_determine'\]\.includes\(token\).*return undefined/s);
});

test('package exposes audit, migration, and targeted validation commands', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['audit:operational-status-options'], 'node scripts/migrateOperationalStatusOptions.js');
  assert.equal(packageJson.scripts['migrate:operational-status-options'], 'node scripts/migrateOperationalStatusOptions.js --apply');
  assert.match(packageJson.scripts['validate:operational-status-options'], /operationalStatusOptionsIntegration\.test\.js/);
});
