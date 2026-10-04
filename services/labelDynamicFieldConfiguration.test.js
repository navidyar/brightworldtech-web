'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LABEL_FIELDS } = require('../config/labelFieldRegistry');
const {
  buildConfiguredLabelFieldGroups,
  configureComposedValuePresets,
  buildLabelDynamicFieldUpdateItems,
  buildLabelDynamicFieldOrderItems,
  validateLabelDynamicFieldUpdateItems
} = require('./labelDynamicFieldConfiguration');

test('code registry fields are active by default and keep configured group structure', () => {
  const groups = buildConfiguredLabelFieldGroups([], { includeInactive: true });
  assert.equal(groups.flatMap((group) => group.fields).length, LABEL_FIELDS.length);
  assert.ok(groups.every((group) => group.fields.every((field) => field.isActive === true)));
  assert.equal(groups.find((group) => group.code === 'catalog').fields.find((field) => field.key === 'unit.cosmetic_grade').label, 'Cosmetic Grade');
});

test('stored label, visibility, and order override presentation without changing supported field identity', () => {
  const rows = [
    { field_key: 'unit.cosmetic_grade', display_label: 'Grade', is_active: 0, sort_order: 1 },
    { field_key: 'unit.processor', display_label: 'CPU', is_active: 1, sort_order: 2 }
  ];
  const activeGroups = buildConfiguredLabelFieldGroups(rows);
  const catalog = activeGroups.find((group) => group.code === 'catalog');
  assert.equal(catalog.fields[0].key, 'unit.processor');
  assert.equal(catalog.fields[0].label, 'CPU');
  assert.equal(catalog.fields.some((field) => field.key === 'unit.cosmetic_grade'), false);

  const editingGroups = buildConfiguredLabelFieldGroups(rows, { includeKeys: ['unit.cosmetic_grade'] });
  const inactiveGrade = editingGroups.find((group) => group.code === 'catalog').fields.find((field) => field.key === 'unit.cosmetic_grade');
  assert.equal(inactiveGrade.label, 'Grade');
  assert.equal(inactiveGrade.isActive, false);
});

test('composed presets use configured labels and exclude inactive fields from new selections', () => {
  const groups = buildConfiguredLabelFieldGroups([
    { field_key: 'unit.ram', display_label: 'RAM', is_active: 1, sort_order: 10 },
    { field_key: 'unit.storage', display_label: 'Drive Size', is_active: 0, sort_order: 20 }
  ], { includeInactive: true });
  const presets = configureComposedValuePresets({
    common: [
      { id: 'ram-only', label: 'old', parts: [{ type: 'field', field: 'unit.ram' }] },
      { id: 'storage-only', label: 'old', parts: [{ type: 'field', field: 'unit.storage' }] }
    ],
    recent: [],
    starter: []
  }, groups);

  assert.equal(presets.common.length, 1);
  assert.equal(presets.common[0].id, 'ram-only');
  assert.equal(presets.common[0].label, 'RAM');
});

test('submitted configuration preserves DOM order per group and active selection', () => {
  const keys = LABEL_FIELDS.map((field) => field.key);
  const swapped = keys.slice();
  const first = swapped[0];
  swapped[0] = swapped[1];
  swapped[1] = first;
  const labels = swapped.map((key) => LABEL_FIELDS.find((field) => field.key === key).label);
  const active = swapped.filter((key) => key !== 'unit.cosmetic_grade');
  const items = buildLabelDynamicFieldUpdateItems({ fieldKeys: swapped, displayLabels: labels, activeFieldKeys: active });

  assert.equal(items.length, LABEL_FIELDS.length);
  assert.equal(items[0].fieldKey, swapped[0]);
  assert.equal(items[0].sortOrder, 10);
  assert.equal(items[1].sortOrder, 20);
  assert.equal(items.find((item) => item.fieldKey === 'unit.cosmetic_grade').isActive, false);
  assert.deepEqual(validateLabelDynamicFieldUpdateItems(items), []);
});

test('configuration validation rejects stale/missing fields and blank labels', () => {
  const items = buildLabelDynamicFieldUpdateItems({
    fieldKeys: LABEL_FIELDS.slice(0, -1).map((field) => field.key),
    displayLabels: LABEL_FIELDS.slice(0, -1).map((field, index) => index === 0 ? '' : field.label),
    activeFieldKeys: LABEL_FIELDS.slice(0, -1).map((field) => field.key)
  });
  const errors = validateLabelDynamicFieldUpdateItems(items);
  assert.ok(errors.some((message) => message.includes('field list changed')));
  assert.ok(errors.some((message) => message.includes('needs a display label')));
});


test('order-only updates accept exactly one complete registry group and preserve submitted order', () => {
  const configured = buildConfiguredLabelFieldGroups([], { includeInactive: true });
  const identity = configured.find((group) => group.code === 'identity');
  const orderedKeys = identity.fields.map((field) => field.key).reverse();
  const result = buildLabelDynamicFieldOrderItems({ groupCode: 'identity', fieldKeys: orderedKeys });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.items.map((item) => item.fieldKey), orderedKeys);
  assert.deepEqual(result.items.map((item) => item.sortOrder), orderedKeys.map((_, index) => (index + 1) * 10));
});

test('order-only updates reject stale or cross-group field sets', () => {
  const configured = buildConfiguredLabelFieldGroups([], { includeInactive: true });
  const identity = configured.find((group) => group.code === 'identity');
  const invalidKeys = identity.fields.slice(1).map((field) => field.key);

  const result = buildLabelDynamicFieldOrderItems({ groupCode: 'identity', fieldKeys: invalidKeys });
  assert.ok(result.errors.some((message) => message.includes('field list changed')));
  assert.equal(result.items.length, 0);
});
