'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Intentional Duplicate creation uses strict identifier inserts and verifies the created Unit serials', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /saveUnitIdentifiers\(connection, unitId, formData, assetNumber, \{ strictInsert: true \}\)/);
  assert.match(model, /assertIntentionalDuplicateIdentifiersSaved\(connection, unitId, formData\)/);
  assert.match(model, /BWT_INTENTIONAL_DUPLICATE_IDENTIFIER_STORAGE_BLOCKED/);
});

test('Intentional Duplicate approval creates and validates against the stored requested destination', () => {
  const model = read('models/unitRequestModel.js');

  assert.match(model, /const creationFormData = \{/);
  assert.match(model, /lotId: String\(request\.requested_destination_lot_id\)/);
  assert.match(model, /createIntentionalDuplicateTechUnitWithConnection\(\s*connection,\s*creationFormData,/);
});

test('the identifier migration permits shared serials across Units and repairs earlier approvals', () => {
  const migration = read('sql/2026-07-stage-7d-intentional-duplicate-identifiers.sql');

  assert.match(migration, /DROP INDEX/);
  assert.match(migration, /uq_unit_identifiers_unit_type_value/);
  assert.match(migration, /unit_id,\s*identifier_type_config_value_id,\s*normalized_value/);
  assert.match(migration, /ur\.status = 'approved'/);
  assert.match(migration, /\$\.formData\.unitSerialNumber/);
  assert.match(migration, /\$\.formData\.biosSerialNumber/);
});

test('the validator rejects approved Intentional Duplicates missing their created-unit serials', () => {
  const validator = read('scripts/validateIntentionalDuplicateIdentifiers.js');

  assert.match(validator, /approved_without_unit_count/);
  assert.match(validator, /missing_count/);
  assert.match(validator, /Global identifier uniqueness is still active/);
});
