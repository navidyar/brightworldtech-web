'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W79D adds only catalog-backed scalar fields to the proven inventory route', () => {
  const policy = read('services/apiScalarInventoryPolicy.js');
  for (const field of ['manufacturer', 'unit_model', 'processor_model', 'operating_system']) {
    assert.match(policy, new RegExp(`${field}: Object\\.freeze`));
  }
  assert.doesNotMatch(policy, /memory_modules|storage_devices|graphics_adapters/);
});

test('catalog ingestion resolves only existing active BWTDallas values and never creates catalog records', () => {
  const catalog = read('services/apiCatalogInventory.js');
  assert.match(catalog, /FROM manufacturers/);
  assert.match(catalog, /FROM unit_models/);
  assert.match(catalog, /FROM unit_model_processor_options/);
  assert.match(catalog, /FROM system_config_categories/);
  assert.match(catalog, /SYSTEM_CONFIG_CATEGORY_IDS\.OPERATING_SYSTEMS/);
  assert.doesNotMatch(catalog, /INSERT\s+INTO\s+(manufacturers|unit_models|processor_models|config_values)/i);
  assert.doesNotMatch(catalog, /UPDATE\s+(manufacturers|unit_models|processor_models|config_values)/i);
});

test('catalog observations preserve submitted text and canonical resolved IDs for provenance and tool ownership', () => {
  const catalog = read('services/apiCatalogInventory.js');
  const policy = read('services/apiScalarInventoryPolicy.js');
  assert.match(catalog, /submitted/);
  assert.match(catalog, /resolved_id/);
  assert.match(catalog, /resolved_label/);
  assert.match(policy, /extractAppliedToolValue/);
  assert.match(policy, /storedValue\.resolved_id/);
});

test('unmapped or ambiguous catalog values are preserved as observations but never guessed into the Unit', () => {
  const service = read('services/apiScalarInventory.js');
  assert.match(service, /catalog_value_ambiguous/);
  assert.match(service, /catalog_value_unmapped/);
  assert.match(service, /application_status/);
  assert.match(service, /ignored_unknown/);
});

test('Processor and OS changes protect manual dependents and clear only stale tool-owned dependents', () => {
  const service = read('services/apiScalarInventory.js');
  assert.match(service, /dependent_processor_speed_manual_override/);
  assert.match(service, /processor_model_changed/);
  assert.match(service, /dependent_os_build_manual_override/);
  assert.match(service, /operating_system_changed/);
  assert.match(service, /invalidatedFields/);
});

test('Stage 10W79D remains isolated from production credit, weighting, Lot movement, and completion', () => {
  const service = read('services/apiScalarInventory.js');
  const catalog = read('services/apiCatalogInventory.js');
  for (const source of [service, catalog]) {
    assert.doesNotMatch(source, /production_cycle|production_weight|unit_work_completions|start_new_production_cycle_on_move/);
  }
});
