'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CATEGORY_BINDINGS,
  VALUE_BINDINGS
} = require('../config/configIdentityRegistry');
const {
  getPlanErrors,
  planConfigIdentityBindings
} = require('./configIdentityMigrationPlanner');

function buildLegacyFixture() {
  const categories = CATEGORY_BINDINGS.map((binding) => ({
    id: 1000 + binding.systemId,
    code: binding.legacyCodes[0] || ''
  }));
  const categoryIdBySystemId = new Map(CATEGORY_BINDINGS.map((binding) => [binding.systemId, 1000 + binding.systemId]));
  const values = VALUE_BINDINGS.map((binding) => ({
    id: 5000 + binding.systemId,
    categoryId: categoryIdBySystemId.get(binding.categorySystemId),
    code: binding.legacyCodes[0] || ''
  }));
  return { categories, values };
}

test('registry system IDs are unique and every system value points to a known category', () => {
  assert.equal(new Set(CATEGORY_BINDINGS.map((binding) => binding.systemId)).size, CATEGORY_BINDINGS.length);
  assert.equal(new Set(VALUE_BINDINGS.map((binding) => binding.systemId)).size, VALUE_BINDINGS.length);
  const categoryIds = new Set(CATEGORY_BINDINGS.map((binding) => binding.systemId));
  VALUE_BINDINGS.forEach((binding) => assert.equal(categoryIds.has(binding.categorySystemId), true, binding.name));
});

test('legacy configuration rows resolve deterministically to numeric system bindings', () => {
  const fixture = buildLegacyFixture();
  const plan = planConfigIdentityBindings(fixture);

  assert.deepEqual(getPlanErrors(plan), []);
  assert.equal(plan.resolvedCategories.size, CATEGORY_BINDINGS.filter((binding) => binding.legacyCodes.length > 0).length);
  assert.equal(plan.missingCategories.some((binding) => binding.name === 'Screen Sizes'), true);
  assert.equal(plan.resolvedValues.size, VALUE_BINDINGS.length);
  assert.equal(plan.missingRequiredValues.length, 0);
  assert.equal(plan.duplicateCategoryTargets.length, 0);
  assert.equal(plan.duplicateValueTargets.length, 0);
});

test('current initial_password_setup password-link value resolves to the setup system identity', () => {
  const fixture = buildLegacyFixture();
  const setupBinding = VALUE_BINDINGS.find((binding) => binding.name === 'Password setup link');
  assert.ok(setupBinding);
  const setupValue = fixture.values.find((row) => row.id === 5000 + setupBinding.systemId);
  assert.ok(setupValue);
  setupValue.code = 'initial_password_setup';

  const plan = planConfigIdentityBindings(fixture);

  assert.equal(plan.resolvedValues.get(setupBinding.systemId), setupValue.id);
  assert.equal(plan.missingRequiredValues.some((binding) => binding.systemId === setupBinding.systemId), false);
});

test('persisted numeric bindings remain authoritative after legacy codes are removed', () => {
  const fixture = buildLegacyFixture();
  const initial = planConfigIdentityBindings(fixture);
  const categoriesWithoutCodes = fixture.categories.map(({ id }) => ({ id, code: '' }));
  const valuesWithoutCodes = fixture.values.map(({ id, categoryId }) => ({ id, categoryId, code: '' }));

  const finalized = planConfigIdentityBindings({
    categories: categoriesWithoutCodes,
    values: valuesWithoutCodes,
    persistedCategoryBindings: initial.resolvedCategories,
    persistedValueBindings: initial.resolvedValues
  });

  assert.deepEqual(getPlanErrors(finalized), []);
  assert.deepEqual(Array.from(finalized.resolvedCategories.entries()), Array.from(initial.resolvedCategories.entries()));
  assert.deepEqual(Array.from(finalized.resolvedValues.entries()), Array.from(initial.resolvedValues.entries()));
});

test('legacy aliases are resolved by priority so the preferred row wins over older aliases', () => {
  const fixture = buildLegacyFixture();
  const binding = CATEGORY_BINDINGS.find((entry) => entry.legacyCodes.length > 1);
  assert.ok(binding);
  const preferred = fixture.categories.find((row) => row.code === binding.legacyCodes[0]);
  fixture.categories.push({ id: 99991, code: binding.legacyCodes[1] });

  const plan = planConfigIdentityBindings(fixture);
  assert.equal(plan.resolvedCategories.get(binding.systemId), preferred.id);
  assert.equal(plan.ambiguousCategories.length, 0);
});

test('ambiguous legacy aliases block the migration instead of selecting an arbitrary row', () => {
  const fixture = buildLegacyFixture();
  const firstBinding = CATEGORY_BINDINGS[0];
  fixture.categories.push({ id: 99999, code: firstBinding.legacyCodes[0] });

  const plan = planConfigIdentityBindings(fixture);
  assert.equal(plan.ambiguousCategories.length, 1);
  assert.match(getPlanErrors(plan).join(' '), /multiple legacy rows/i);
});

test('missing required system values block the migration', () => {
  const fixture = buildLegacyFixture();
  const requiredBinding = VALUE_BINDINGS.find((binding) => binding.required);
  fixture.values = fixture.values.filter((row) => row.id !== 5000 + requiredBinding.systemId);

  const plan = planConfigIdentityBindings(fixture);
  assert.equal(plan.missingRequiredValues.some((binding) => binding.systemId === requiredBinding.systemId), true);
  assert.match(getPlanErrors(plan).join(' '), /required system configuration values are missing/i);
});

test('persisted value bindings are rejected when the bound value belongs to the wrong category', () => {
  const fixture = buildLegacyFixture();
  const initial = planConfigIdentityBindings(fixture);
  const binding = VALUE_BINDINGS[0];
  const configValueId = initial.resolvedValues.get(binding.systemId);
  const wrongCategory = fixture.categories.find((row) => row.id !== initial.resolvedCategories.get(binding.categorySystemId));
  const value = fixture.values.find((row) => row.id === configValueId);
  value.categoryId = wrongCategory.id;

  const plan = planConfigIdentityBindings({
    ...fixture,
    persistedCategoryBindings: initial.resolvedCategories,
    persistedValueBindings: initial.resolvedValues
  });

  assert.equal(plan.invalidPersistedValues.length > 0, true);
  assert.match(getPlanErrors(plan).join(' '), /persisted value bindings are invalid/i);
});

test('unknown persisted system IDs block finalization', () => {
  const fixture = buildLegacyFixture();
  const initial = planConfigIdentityBindings(fixture);
  const persistedCategoryBindings = new Map(initial.resolvedCategories);
  persistedCategoryBindings.set(65000, fixture.categories[0].id);

  const plan = planConfigIdentityBindings({
    ...fixture,
    persistedCategoryBindings,
    persistedValueBindings: initial.resolvedValues
  });

  assert.deepEqual(plan.unknownPersistedCategoryBindings, [{ systemId: 65000, configId: fixture.categories[0].id }]);
  assert.match(getPlanErrors(plan).join(' '), /unknown numeric system bindings/i);
});
