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
  assert.equal(UNIT_FORM_FIELD_REGISTRY.length, 54);
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

test('repeatable sections are configurable while their child controls are not independently configurable', () => {
  for (const sectionKey of ['memory_modules', 'storage_devices', 'cosmetic_issues', 'hardware_issues']) {
    const section = getUnitFormFieldDefinition(sectionKey);

    assert.equal(section.ruleType, RULE_TYPE.REPEATABLE_SECTION);
    assert.equal(section.visibilityConfigurable, true);
    assert.equal(section.requirementConfigurable, true);
    assert.match(section.requiredSemantics, /meaningful/i);
  }

  for (const field of UNIT_FORM_FIELD_REGISTRY.filter((entry) => entry.ruleType === RULE_TYPE.REPEATABLE_CHILD)) {
    assert.equal(field.enabledForLotRules, false);
    assert.equal(field.visibilityConfigurable, false);
    assert.equal(field.requirementConfigurable, false);
    assert.ok(getUnitFormFieldDefinition(field.parentKey));
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
  assert.ok(listUnitFormFieldsBySection('system').length > 0);
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
