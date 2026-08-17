'use strict';

const {
  CATEGORY_BINDINGS,
  VALUE_BINDINGS
} = require('../config/configIdentityRegistry');

function normalizeCode(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeBindingMap(bindings) {
  if (bindings instanceof Map) {
    return new Map(Array.from(bindings.entries()).map(([systemId, configId]) => [Number(systemId), Number(configId)]));
  }

  return new Map((Array.isArray(bindings) ? bindings : []).map((row) => [
    Number(row.systemId ?? row.system_config_category_id ?? row.system_config_value_id),
    Number(row.configId ?? row.config_category_id ?? row.config_value_id)
  ]));
}

function normalizeCategories(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: Number(row.id ?? row.config_category_id),
    code: normalizeCode(row.code)
  })).filter((row) => Number.isSafeInteger(row.id) && row.id > 0);
}

function normalizeValues(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: Number(row.id ?? row.config_value_id),
    categoryId: Number(row.categoryId ?? row.config_category_id),
    code: normalizeCode(row.code)
  })).filter((row) => Number.isSafeInteger(row.id) && row.id > 0 && Number.isSafeInteger(row.categoryId) && row.categoryId > 0);
}

function findUniqueLegacyMatch(rows, legacyCodes, predicate = () => true) {
  const aliases = (legacyCodes || []).map(normalizeCode).filter(Boolean);

  for (const alias of aliases) {
    const matches = rows.filter((row) => row.code === alias && predicate(row));
    if (matches.length === 0) continue;
    return {
      match: matches.length === 1 ? matches[0] : null,
      matches,
      matchedAlias: alias
    };
  }

  return { match: null, matches: [], matchedAlias: null };
}

function findDuplicateTargets(bindingMap) {
  const byTarget = new Map();
  for (const [systemId, configId] of bindingMap) {
    const targets = byTarget.get(configId) || [];
    targets.push(systemId);
    byTarget.set(configId, targets);
  }

  return Array.from(byTarget.entries())
    .filter(([, systemIds]) => systemIds.length > 1)
    .map(([configId, systemIds]) => ({ configId, systemIds: systemIds.slice().sort((a, b) => a - b) }));
}

function planConfigIdentityBindings({
  categories = [],
  values = [],
  persistedCategoryBindings = new Map(),
  persistedValueBindings = new Map()
} = {}) {
  const categoryRows = normalizeCategories(categories);
  const valueRows = normalizeValues(values);
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));
  const valueById = new Map(valueRows.map((row) => [row.id, row]));
  const persistedCategories = normalizeBindingMap(persistedCategoryBindings);
  const persistedValues = normalizeBindingMap(persistedValueBindings);
  const knownCategorySystemIds = new Set(CATEGORY_BINDINGS.map((binding) => Number(binding.systemId)));
  const knownValueSystemIds = new Set(VALUE_BINDINGS.map((binding) => Number(binding.systemId)));

  const resolvedCategories = new Map();
  const missingCategories = [];
  const ambiguousCategories = [];
  const invalidPersistedCategories = [];

  for (const binding of CATEGORY_BINDINGS) {
    const persistedConfigId = persistedCategories.get(binding.systemId);
    if (persistedConfigId) {
      if (!categoryById.has(persistedConfigId)) {
        invalidPersistedCategories.push({ systemId: binding.systemId, configId: persistedConfigId, name: binding.name });
      } else {
        resolvedCategories.set(binding.systemId, persistedConfigId);
      }
      continue;
    }

    const { match, matches } = findUniqueLegacyMatch(categoryRows, binding.legacyCodes);
    if (matches.length > 1) {
      ambiguousCategories.push({ systemId: binding.systemId, name: binding.name, configIds: matches.map((row) => row.id) });
    } else if (match) {
      resolvedCategories.set(binding.systemId, match.id);
    } else {
      missingCategories.push(binding);
    }
  }

  const resolvedValues = new Map();
  const missingRequiredValues = [];
  const missingOptionalValues = [];
  const ambiguousValues = [];
  const invalidPersistedValues = [];

  for (const binding of VALUE_BINDINGS) {
    const expectedCategoryId = resolvedCategories.get(binding.categorySystemId);
    const persistedConfigId = persistedValues.get(binding.systemId);

    if (persistedConfigId) {
      const value = valueById.get(persistedConfigId);
      if (!value || !expectedCategoryId || value.categoryId !== Number(expectedCategoryId)) {
        invalidPersistedValues.push({
          systemId: binding.systemId,
          configId: persistedConfigId,
          name: binding.name,
          expectedCategoryId: expectedCategoryId || null,
          actualCategoryId: value?.categoryId || null
        });
      } else {
        resolvedValues.set(binding.systemId, persistedConfigId);
      }
      continue;
    }

    const { match, matches } = expectedCategoryId
      ? findUniqueLegacyMatch(valueRows, binding.legacyCodes, (row) => row.categoryId === Number(expectedCategoryId))
      : { match: null, matches: [] };

    if (matches.length > 1) {
      ambiguousValues.push({ systemId: binding.systemId, name: binding.name, configIds: matches.map((row) => row.id) });
    } else if (match) {
      resolvedValues.set(binding.systemId, match.id);
    } else {
      (binding.required ? missingRequiredValues : missingOptionalValues).push(binding);
    }
  }

  const unknownPersistedCategoryBindings = Array.from(persistedCategories.entries())
    .filter(([systemId]) => !knownCategorySystemIds.has(systemId))
    .map(([systemId, configId]) => ({ systemId, configId }));
  const unknownPersistedValueBindings = Array.from(persistedValues.entries())
    .filter(([systemId]) => !knownValueSystemIds.has(systemId))
    .map(([systemId, configId]) => ({ systemId, configId }));

  return {
    resolvedCategories,
    resolvedValues,
    missingCategories,
    missingRequiredValues,
    missingOptionalValues,
    ambiguousCategories,
    ambiguousValues,
    invalidPersistedCategories,
    invalidPersistedValues,
    unknownPersistedCategoryBindings,
    unknownPersistedValueBindings,
    duplicateCategoryTargets: findDuplicateTargets(resolvedCategories),
    duplicateValueTargets: findDuplicateTargets(resolvedValues)
  };
}

function getPlanErrors(plan) {
  const errors = [];
  if (plan.missingRequiredValues.length) errors.push('Required system configuration values are missing.');
  if (plan.ambiguousCategories.length) errors.push('One or more system categories match multiple legacy rows.');
  if (plan.ambiguousValues.length) errors.push('One or more system values match multiple legacy rows.');
  if (plan.invalidPersistedCategories.length) errors.push('One or more persisted category bindings are invalid.');
  if (plan.invalidPersistedValues.length) errors.push('One or more persisted value bindings are invalid.');
  if (plan.unknownPersistedCategoryBindings.length || plan.unknownPersistedValueBindings.length) errors.push('Unknown numeric system bindings exist.');
  if (plan.duplicateCategoryTargets.length || plan.duplicateValueTargets.length) errors.push('Multiple numeric system identities resolve to the same configuration row.');
  return errors;
}

module.exports = {
  findDuplicateTargets,
  getPlanErrors,
  normalizeCode,
  planConfigIdentityBindings
};
