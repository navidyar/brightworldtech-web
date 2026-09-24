'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('System UUID is a first-class protected identifier and configurable Unit Form field', () => {
  const identities = read('config/configIdentityRegistry.js');
  const registry = read('config/unitFormFieldRegistry.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(identities, /IDENTIFIER_SYSTEM_UUID:\s*205/);
  assert.match(identities, /System UUID identifier/);
  assert.match(registry, /configurableField\('system_uuid',\s*'System UUID'/);
  assert.match(form, /name="systemUuid"/);
});

test('UUID browser display is compact while retaining the full underlying value', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/app.css');
  assert.match(table, /tech-unit-summary-id-item--uuid/);
  assert.match(table, /title="<%= systemUuidValue %>"/);
  assert.match(css, /tech-unit-summary-id-value--uuid[\s\S]*text-overflow:\s*ellipsis/);
});

test('Lot foundation has one duplicate permission label plus inherited Tool source and completion controls', () => {
  const modal = read('views/fragments/lot-form-modal.ejs');
  const page = read('views/pages/management-lot-new.ejs');
  const partial = read('views/partials/lot-tool-policy-fields.ejs');
  const policy = read('services/lotToolPolicy.js');
  const combined = `${modal}\n${page}`;
  assert.match(combined, /Allow Duplicate Units Without Approval/);
  assert.doesNotMatch(combined, /Allow duplicate-match unit assumption/);
  for (const label of [
    'Allow Manual Create/Update', 'Allow ScanTools', 'Allow TechTools',
    'Require ScanTools Before Completion', 'Require TechTools Before Completion'
  ]) assert.match(partial, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(policy, /allowManualCreateUpdate[\s\S]*defaultValue:\s*true/);
  assert.match(policy, /requireScanToolsBeforeCompletion[\s\S]*defaultValue:\s*false/);
});

test('manual_override is cycle-scoped while ordinary tech_edit remains replaceable', () => {
  const authority = read('services/unitFieldAuthority.js');
  const sourceModel = read('models/unitFieldSourceModel.js');
  const scalarPolicy = read('services/apiScalarInventoryPolicy.js');
  assert.match(authority, /source === 'manual_override'/);
  assert.match(authority, /overrideKey === currentKey/);
  assert.match(authority, /source === 'tech_edit' \|\| source === 'expired_manual_override'/);
  assert.match(sourceModel, /getCurrentProductionCycleKey/);
  assert.match(sourceModel, /setManualOverride/);
  assert.match(scalarPolicy, /active_cycle_manual_override/);
});

test('Tool receipts receive a server-owned production cycle key and report_id remains idempotent', () => {
  const inventory = read('services/apiScalarInventory.js');
  assert.match(inventory, /getCurrentProductionCycleKey\(safeUnitId, connection\)/);
  assert.match(inventory, /INSERT INTO unit_tool_runs[\s\S]*report_id[\s\S]*production_cycle_key/);
  assert.match(inventory, /WHERE tool_source = \? AND report_id = \?/);
  assert.doesNotMatch(inventory, /body\.production_cycle_key/);
});

test('Tool UUID ingestion is conservative and does not silently overwrite established identity', () => {
  const unitModel = read('models/techUnitModel.js');
  const inventory = read('services/apiScalarInventory.js');
  assert.match(unitModel, /applyToolSystemUuidIdentifier/);
  assert.match(unitModel, /BWT_SYSTEM_UUID_IDENTITY_CONFLICT/);
  assert.match(inventory, /SYSTEM_UUID_IDENTITY_CONFLICT/);
  assert.match(inventory, /\['system_uuid',[\s\S]*applyToolSystemUuidIdentifier/);
  assert.match(inventory, /for \(const identityResult of identityEnrichments\)[\s\S]*INSERT INTO unit_tool_observations[\s\S]*field_key, observation_state[\s\S]*VALUES \(\?, \?, \?, 'known'/);
});

test('reconciliation migration moves legacy UUID storage without adding global UUID uniqueness', () => {
  const migration = read('scripts/migrateApiFoundationReconciliation.js');
  assert.match(migration, /migrateLegacyUuidRows/);
  assert.match(migration, /ALTER TABLE unit_specifications DROP COLUMN system_uuid/);
  assert.match(migration, /override_production_cycle_key/);
  assert.match(migration, /production_cycle_key/);
  assert.doesNotMatch(migration, /UNIQUE[^\n]*system_uuid|UNIQUE[^\n]*normalized_value/);
  assert.doesNotMatch(migration, /unit_work_completions|credited_weight|production_weight/);
});

test('foundation does not add a second Lot duplicate permission or a preflight/work-session subsystem', () => {
  const migration = read('scripts/migrateApiFoundationReconciliation.js');
  const lotModel = read('models/lotModel.js');
  assert.doesNotMatch(migration, /allow_intentional_duplicates|allow_duplicate_units_without_approval/);
  assert.match(lotModel, /allow_duplicate_unit_assumption/);
  assert.doesNotMatch(migration, /preflight_id|work_session/);
});
