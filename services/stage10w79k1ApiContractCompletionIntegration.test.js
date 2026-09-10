'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('duplicate resolver gives Asset Tag authority, then serial AND, then OR fallback', () => {
  const identity = read('services/apiUnitIdentity.js');
  assert.match(identity, /matchMode: 'asset_tag_exact'/);
  assert.match(identity, /const intersection = intersectSets\(unitSerialSet, biosSerialSet\)/);
  assert.match(identity, /matchMode: 'serial_and'/);
  assert.match(identity, /const fallback = unionSets\(unitSerialSet, biosSerialSet\)/);
  assert.match(identity, /matchMode: 'serial_or_fallback'/);
  assert.match(identity, /Asset Tag is authoritative/);
});

test('API duplicate responses are informational and include operational Unit summaries', () => {
  const intake = read('services/apiUnitIntake.js');
  assert.match(intake, /match_count: serializedMatches\.length/);
  assert.match(intake, /requires_user_review: serializedMatches\.length > 0/);
  assert.match(intake, /match_reasons/);
  assert.match(intake, /processor:/);
  assert.match(intake, /memory:/);
  assert.match(intake, /storage:/);
  assert.match(intake, /assignment:/);
  assert.match(intake, /status:/);
  assert.match(intake, /Keep the original candidates key for v1 clients/);
  assert.doesNotMatch(intake, /assumeExistingTechUnitFromDuplicateMatch/);
});

test('Lot duplicate-match policy is exposed and gates duplicate Unit creation', () => {
  const intake = read('services/apiUnitIntake.js');
  assert.match(intake, /allow_duplicate_match_unit_assumption/);
  assert.match(intake, /lot_allows_duplicate_match_unit_assumption/);
  assert.match(intake, /UNIT_DUPLICATE_REVIEW_REQUIRED/);
  assert.match(intake, /DUPLICATE_MATCH_CONFIRMATION_REQUIRED/);
  assert.match(intake, /confirm_duplicate_match_creation/);
  assert.match(intake, /allowDuplicateIdentifiers: allowDuplicateCreation/);
});

test('Asset Tag can identify an existing Unit but can never be assigned by tool creation', () => {
  const intake = read('services/apiUnitIntake.js');
  assert.match(intake, /match_mode === 'asset_tag_exact'/);
  assert.match(intake, /UNIT_ALREADY_EXISTS/);
  assert.match(intake, /ASSET_TAG_NOT_ASSIGNABLE/);
  assert.match(intake, /assetTag: 'bwtdallas_generated'/);
});

test('Unit Serial is documented as Tech-entered provenance while BIOS Serial is tool-observed', () => {
  const intake = read('services/apiUnitIntake.js');
  assert.match(intake, /Unit Serial is never inferred by the tool/);
  assert.match(intake, /unitSerialNumber: identity\.unitSerialNumber/);
  assert.match(intake, /biosSerialNumber: identity\.biosSerialNumber/);
  assert.match(intake, /unitSerialNumber: identity\.unitSerialNumber \? 'tech_user_input_via_tool'/);
  assert.match(intake, /biosSerialNumber: identity\.biosSerialNumber \? 'tool_observed'/);
});

test('duplicate identifier persistence bypass is opt-in and preserves normal web create behavior by default', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /const allowDuplicateIdentifiers = options\.allowDuplicateIdentifiers === true/);
  assert.match(model, /duplicateMatches\.length > 0 && !allowDuplicateIdentifiers/);
  assert.match(model, /strictInsert: allowDuplicateIdentifiers/);
  assert.match(model, /if \(allowDuplicateIdentifiers\) \{\s*await assertIntentionalDuplicateIdentifiersSaved/);
  assert.match(model, /BWT_DUPLICATE_IDENTIFIER_STORAGE_BLOCKED/);
});

test('duplicate candidate query returns Lot, assignment, status, processor, Memory, and Storage information', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /l\.name AS lot_name/);
  assert.match(model, /assigned_user\.username AS assigned_username/);
  assert.match(model, /current_unit_status_label/);
  assert.match(model, /u\.ram_gb/);
  assert.match(model, /ram_type_label/);
  assert.match(model, /u\.storage_gb/);
  assert.match(model, /storage_type_label/);
});

test('Keyboard Language and Windows Release are accepted by scalar inventory with manual precedence preserved', () => {
  const policy = read('services/apiScalarInventoryPolicy.js');
  const inventory = read('services/apiScalarInventory.js');
  assert.match(policy, /windows_display_version/);
  assert.match(policy, /keyboard_language/);
  assert.match(policy, /formProperty: 'keyboardLanguageConfigValueId'/);
  assert.match(inventory, /SYSTEM_CONFIG_CATEGORY_IDS\.KEYBOARD_LANGUAGES/);
  assert.match(inventory, /keyboardLanguageAliases/);
  assert.match(inventory, /keyboard_language_config_value_id/);
  assert.match(inventory, /windows_display_version/);
  assert.match(inventory, /dependent_os_build_manual_override/);
  assert.match(inventory, /dependent_windows_display_version_manual_override/);
});

test('Operating System changes treat OS Build and Windows Release as dependent current-state fields', () => {
  const inventory = read('services/apiScalarInventory.js');
  assert.match(inventory, /\['os_build', plans\.get\('os_build'\)\]/);
  assert.match(inventory, /\['windows_display_version', plans\.get\('windows_display_version'\)\]/);
  assert.match(inventory, /reason: 'operating_system_changed'/);
  assert.match(inventory, /fieldLabel: 'Windows Release'/);
});

test('K1 adds only the additive Windows Release schema column and Tool Details remains migration-safe', () => {
  const migration = read('scripts/migrateApiContractCompletion.js');
  const details = read('models/unitToolDetailsModel.js');
  const fragment = read('views/fragments/tech-unit-tool-details.ejs');
  assert.match(migration, /COLUMN_NAME = 'windows_display_version'/);
  assert.match(migration, /VARCHAR\(80\) NULL/);
  assert.match(migration, /No database changes were made/);
  assert.match(details, /columnExists\('unit_specifications', 'windows_display_version'\)/);
  assert.match(details, /NULL AS windows_display_version/);
  assert.match(fragment, /addField\('Windows Release', specs\.windows_display_version\)/);
});
