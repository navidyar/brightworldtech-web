'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FIELD_DEPENDENCY_RULES,
  RULE_TYPE,
  UNIT_FORM_FIELD_REGISTRY,
  assertValidUnitFormFieldRegistry,
  getUnitFormFieldDefinition,
  listLotConfigurableUnitFormFields,
  listUnitFormFieldsBySection
} = require('../config/unitFormFieldRegistry');

test('authoritative registry contains every Stage 1A audited control', () => {
  assert.equal(UNIT_FORM_FIELD_REGISTRY.length, 91);
  assert.equal(assertValidUnitFormFieldRegistry(), true);
});

test('protected routing and system fields cannot be changed by lot rules', () => {
  for (const key of [
    'assignable_lot',
    'current_unit_status',
    'duplicate_assumption_nonce',
    'asset_tag',
    'unit_category'
  ]) {
    const field = getUnitFormFieldDefinition(key);

    assert.ok(field, `Expected ${key} to exist.`);
    assert.equal(field.protected, true);
    assert.equal(field.enabledForLotRules, false);
    assert.equal(field.visibilityConfigurable, false);
    assert.equal(field.requirementConfigurable, false);
  }
});

test('previous memory and storage can be hidden, optional, or required by Lot configuration', () => {
  for (const [fieldKey, sourceKey] of [
    ['previous_memory_size', 'memory_modules'],
    ['previous_storage_size', 'storage_devices']
  ]) {
    const field = getUnitFormFieldDefinition(fieldKey);

    assert.ok(field);
    assert.equal(field.visibilityConfigurable, true);
    assert.equal(field.requirementConfigurable, true);
    assert.equal(field.enabledForLotRules, true);
    assert.equal(field.inheritVisibilityFromFieldKey, sourceKey);
  }
});


test('linked visibility defaults reference one direct registered source', () => {
  const previousMemory = getUnitFormFieldDefinition('previous_memory_size');
  const previousStorage = getUnitFormFieldDefinition('previous_storage_size');

  assert.equal(previousMemory.inheritVisibilityFromFieldKey, 'memory_modules');
  assert.equal(previousStorage.inheritVisibilityFromFieldKey, 'storage_devices');

  assert.throws(
    () => assertValidUnitFormFieldRegistry([
      ...UNIT_FORM_FIELD_REGISTRY,
      {
        ...previousMemory,
        key: 'invalid_linked_visibility',
        inheritVisibilityFromFieldKey: 'missing_field'
      }
    ]),
    /inherits visibility from unknown field/
  );
});

test('compound repeatable rows stay section-controlled so their conditional child semantics remain intact', () => {
  for (const sectionKey of ['memory_modules', 'storage_devices', 'cosmetic_issues', 'hardware_issues']) {
    const section = getUnitFormFieldDefinition(sectionKey);

    assert.equal(section.ruleType, RULE_TYPE.REPEATABLE_SECTION);
    assert.equal(section.visibilityConfigurable, true);
    assert.equal(section.requirementConfigurable, true);
    assert.match(section.requiredSemantics, /meaningful/i);
  }

  for (const field of UNIT_FORM_FIELD_REGISTRY.filter((entry) => entry.ruleType === RULE_TYPE.REPEATABLE_CHILD)) {
    assert.ok(getUnitFormFieldDefinition(field.parentKey));
    if (['camera_type', 'camera_location', 'camera_test', 'battery_health', 'battery_cycle_count', 'biometric_hardware', 'biometrics_test', 'port_type', 'port_count'].includes(field.key)) {
      assert.equal(field.enabledForLotRules, true);
      assert.equal(field.visibilityConfigurable, true);
      assert.equal(field.requirementConfigurable, true);
    } else {
      assert.equal(field.enabledForLotRules, false);
      assert.equal(field.visibilityConfigurable, false);
      assert.equal(field.requirementConfigurable, false);
    }
  }
});

test('lot-configurable list excludes permission, workflow, system, legacy, and disabled future controls', () => {
  const configurableKeys = new Set(listLotConfigurableUnitFormFields().map((field) => field.key));

  for (const key of [
    'production_weight_override',
    'missing_model_request',
    'outcome_approval',
    'general_comment_type',
    'hardware_notes',
    'graphics_adapters'
  ]) {
    assert.equal(configurableKeys.has(key), false, `${key} should not be lot-configurable.`);
  }

  for (const key of ['bios_serial_number', 'operating_system', 'memory_modules', 'unit_outcome']) {
    assert.equal(configurableKeys.has(key), true, `${key} should be lot-configurable.`);
  }
});

test('section lookup and dependency rules only reference registered fields', () => {
  assert.ok(listUnitFormFieldsBySection('specifications').length > 0);
  assert.ok(listUnitFormFieldsBySection('tests').length > 0);
  assert.equal(listUnitFormFieldsBySection('unknown_section').length, 0);
  assert.equal(assertValidUnitFormFieldRegistry(UNIT_FORM_FIELD_REGISTRY, FIELD_DEPENDENCY_RULES), true);
});

test('validator rejects duplicate keys and unknown dependency targets', () => {
  const duplicateRegistry = [
    ...UNIT_FORM_FIELD_REGISTRY,
    { ...UNIT_FORM_FIELD_REGISTRY[0] }
  ];

  assert.throws(
    () => assertValidUnitFormFieldRegistry(duplicateRegistry, FIELD_DEPENDENCY_RULES),
    /Duplicate unit form field key/
  );

  assert.throws(
    () => assertValidUnitFormFieldRegistry(UNIT_FORM_FIELD_REGISTRY, [
      { whenVisible: 'bios_serial_number', forceVisible: ['not_a_real_field'] }
    ]),
    /unknown forceVisible field/
  );
});

test('Configure Unit Form exposes every independently configurable live Add/Edit field', () => {
  const configurableKeys = listLotConfigurableUnitFormFields().map((field) => field.key);

  assert.deepEqual(configurableKeys, [
    'unit_serial_number', 'bios_serial_number', 'amazon_asset_tag', 'fnsku', 'asin', 'tracking_number', 'pallet_number',
    'buyer_comments', 'manufacturer', 'unit_model', 'screen_size', 'apple_model_number', 'model_year',
    'processor_model', 'processor_speed_ghz', 'memory_modules', 'previous_memory_size', 'storage_devices',
    'previous_storage_size', 'operating_system', 'os_build', 'bios_version', 'keyboard_language',
    'wifi_card_present', 'charger_included', 'display_type', 'native_screen_resolution', 'refresh_rate',
    'color', 'cameras', 'camera_type', 'camera_location', 'camera_test', 'batteries',
    'battery_health', 'battery_cycle_count', 'biometrics', 'biometric_hardware', 'biometrics_test', 'ports',
    'port_type', 'port_count', 'keyboard_test', 'touchscreen_status', 'microphone_check', 'audio_output_check',
    'all_screws_present', 'complete_diagnostics', 'virus_check', 'driver_check', 'absolute_status', 'bios_lock',
    'efi_lock', 'mdm_lock', 'icloud_activation_lock', 'ce_certification', 'open_box_status', 'box_language',
    'skinned_status', 'cosmetic_issues', 'hardware_issues', 'overall_grade', 'unit_outcome',
    'overall_grade_notes', 'outcome_notes', 'general_comment'
  ]);

  for (const field of listLotConfigurableUnitFormFields()) {
    assert.equal(field.visibilityConfigurable, true, `${field.key} should support visibility.`);
    const visibilityOnly = field.key === 'amazon_asset_tag';
    assert.equal(field.requirementConfigurable, !visibilityOnly, `${field.key} required/optional policy mismatch.`);
  }
});
