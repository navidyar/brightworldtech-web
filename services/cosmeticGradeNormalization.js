'use strict';

const {
  COSMETIC_GRADE_BY_SYSTEM_VALUE_ID,
  SYSTEM_CONFIG_CATEGORY_IDS
} = require('../config/configIdentityRegistry');

const CANONICAL_COSMETIC_GRADES = Object.freeze([
  Object.freeze({ code: 's', value: 'S', label: 'S', description: 'Supreme Grade; highest cosmetic condition.', sortOrder: 5 }),
  Object.freeze({ code: 'a', value: 'A', label: 'A', sortOrder: 10 }),
  Object.freeze({ code: 'ab', value: 'AB', label: 'AB', sortOrder: 20 }),
  Object.freeze({ code: 'b', value: 'B', label: 'B', sortOrder: 30 }),
  Object.freeze({ code: 'c', value: 'C', label: 'C', sortOrder: 40 }),
  Object.freeze({ code: 'd', value: 'D', label: 'D', sortOrder: 50 })
]);

const CANONICAL_GRADE_BY_TOKEN = new Map([
  ['s', 'S'],
  ['supreme', 'S'],
  ['a', 'A'],
  ['ab', 'AB'],
  ['a_b', 'AB'],
  ['b', 'B'],
  ['c', 'C'],
  ['d', 'D']
]);

const CANONICAL_GRADE_ORDER = new Map(
  CANONICAL_COSMETIC_GRADES.map((grade, index) => [grade.value, index])
);
const CANONICAL_LOWER_GRADE_SET = new Set(['AB', 'B', 'C', 'D']);

function normalizeCosmeticGradeToken(value) {
  const rawValue = String(value || '').trim().toLowerCase();
  const suffix = rawValue.endsWith('+') ? '_plus' : (rawValue.endsWith('-') ? '_minus' : '');
  const withoutSuffix = suffix ? rawValue.slice(0, -1) : rawValue;

  return `${withoutSuffix
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(cosmetic_)?grade_/, '')
    .replace(/_grade$/, '')}${suffix}`;
}

function isNotYetGradedToken(value) {
  return ['n_a', 'na', 'not_applicable', 'not_yet_graded', 'not_graded', 'ungraded']
    .includes(normalizeCosmeticGradeToken(value));
}

function getCanonicalCosmeticGrade(value) {
  const token = normalizeCosmeticGradeToken(value);
  return CANONICAL_GRADE_BY_TOKEN.get(token) || null;
}

function getCanonicalCosmeticGradeFromOption(option = {}) {
  const systemId = Number(option.systemConfigValueId || option.system_config_value_id || 0);
  if (COSMETIC_GRADE_BY_SYSTEM_VALUE_ID[systemId]) {
    return COSMETIC_GRADE_BY_SYSTEM_VALUE_ID[systemId];
  }

  for (const candidate of [option.code, option.label, option.value]) {
    const grade = getCanonicalCosmeticGrade(candidate);

    if (grade) {
      return grade;
    }
  }

  return null;
}

function isCosmeticGradeCategoryOption(option = {}) {
  const systemCategoryId = Number(option.systemConfigCategoryId || option.system_config_category_id || 0);
  if (systemCategoryId === SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES) {
    return true;
  }

  const source = String(option.source || option.categoryCode || option.category_code || '').trim().toLowerCase();
  return ['cosmetic_grades', 'overall_grade', 'overall_unit_grades', 'unit_grades', 'unit_grade', 'grades'].includes(source);
}

function getCosmeticGradeOptionPriority(option = {}, canonicalGrade) {
  const source = String(option.source || option.categoryCode || option.category_code || '').trim().toLowerCase();
  const code = String(option.code || '').trim().toLowerCase();
  const label = String(option.label || '').trim().toUpperCase();
  const value = String(option.rawValue || option.databaseValue || option.value || '').trim().toUpperCase();
  let priority = 0;

  if (Number(option.systemConfigValueId || option.system_config_value_id || 0) > 0 || source === 'cosmetic_grades') {
    priority += 100;
  }
  if (code === canonicalGrade.toLowerCase()) {
    priority += 20;
  }
  if (label === canonicalGrade) {
    priority += 10;
  }
  if (value === canonicalGrade) {
    priority += 5;
  }

  return priority;
}

function getConfigValueIdFromOption(option = {}) {
  const directId = Number(option.id || option.configValueId || option.config_value_id || 0);

  if (Number.isSafeInteger(directId) && directId > 0) {
    return directId;
  }

  const tokenMatch = String(option.value || '').trim().match(/^config_value:(\d+)$/);
  const tokenId = tokenMatch ? Number(tokenMatch[1]) : 0;
  return Number.isSafeInteger(tokenId) && tokenId > 0 ? tokenId : null;
}

function getOptionSortOrder(option = {}) {
  const parsed = Number(option.sortOrder ?? option.sort_order);
  return Number.isFinite(parsed) ? parsed : 999999;
}

function getOptionDisplayLabel(option = {}, fallback = '') {
  return String(option.label || option.displayLabel || option.name || option.rawValue || option.databaseValue || option.value || fallback || '').trim();
}

function annotateCosmeticIssuePolicy(options) {
  const aOption = options.find((option) => option.canonicalGrade === 'A') || null;
  const aSortOrder = aOption ? getOptionSortOrder(aOption) : null;

  return options.map((option) => {
    let requiresCosmeticIssue = false;

    if (CANONICAL_LOWER_GRADE_SET.has(option.canonicalGrade)) {
      requiresCosmeticIssue = true;
    } else if (!option.canonicalGrade && aSortOrder !== null) {
      requiresCosmeticIssue = getOptionSortOrder(option) > aSortOrder;
    }

    return {
      ...option,
      requiresCosmeticIssue
    };
  });
}

function normalizeCosmeticGradeOptions(options) {
  const canonicalGroups = new Map();
  const customOptions = [];

  (Array.isArray(options) ? options : []).forEach((option) => {
    if ([option.code, option.label, option.value].some(isNotYetGradedToken)) {
      return;
    }

    const canonicalGrade = getCanonicalCosmeticGradeFromOption(option);
    const configValueId = getConfigValueIdFromOption(option);

    if (!canonicalGrade) {
      if (!isCosmeticGradeCategoryOption(option) || !configValueId) {
        return;
      }

      customOptions.push({
        ...option,
        id: option.id || configValueId,
        configValueId,
        label: getOptionDisplayLabel(option, `Grade ${configValueId}`),
        canonicalGrade: null,
        sortOrder: getOptionSortOrder(option),
        filterIds: [configValueId],
        legacyValues: option.value ? [option.value] : []
      });
      return;
    }

    const candidate = {
      ...option,
      id: option.id || configValueId,
      configValueId: configValueId || option.configValueId,
      code: canonicalGrade.toLowerCase(),
      label: getOptionDisplayLabel(option, canonicalGrade),
      canonicalGrade,
      sortOrder: getOptionSortOrder(option)
    };
    const priority = getCosmeticGradeOptionPriority(option, canonicalGrade);
    const existing = canonicalGroups.get(canonicalGrade) || {
      option: null,
      priority: -1,
      filterIds: [],
      legacyValues: []
    };

    if (configValueId && !existing.filterIds.includes(configValueId)) {
      existing.filterIds.push(configValueId);
    }
    if (option.value && !existing.legacyValues.includes(option.value)) {
      existing.legacyValues.push(option.value);
    }

    if (!existing.option || priority > existing.priority) {
      existing.option = candidate;
      existing.priority = priority;
    }

    canonicalGroups.set(canonicalGrade, existing);
  });

  const normalized = [
    ...Array.from(canonicalGroups.values()).map((entry) => ({
      ...entry.option,
      filterIds: entry.filterIds,
      legacyValues: entry.legacyValues
    })),
    ...customOptions
  ].sort((left, right) => {
    const sortDifference = getOptionSortOrder(left) - getOptionSortOrder(right);
    if (sortDifference !== 0) return sortDifference;

    const canonicalDifference = (CANONICAL_GRADE_ORDER.get(left.canonicalGrade) ?? 999)
      - (CANONICAL_GRADE_ORDER.get(right.canonicalGrade) ?? 999);
    if (canonicalDifference !== 0) return canonicalDifference;

    return String(left.label || '').localeCompare(String(right.label || ''), undefined, { numeric: true, sensitivity: 'base' });
  });

  return annotateCosmeticIssuePolicy(normalized);
}

function normalizeCosmeticGradeRequirementOptions(options) {
  return normalizeCosmeticGradeOptions(options);
}

function cosmeticGradeLabelsMatch(requiredValue, actualValue) {
  const requiredGrade = getCanonicalCosmeticGrade(requiredValue);

  if (!requiredGrade) {
    return false;
  }

  return String(actualValue || '')
    .split(',')
    .map(getCanonicalCosmeticGrade)
    .filter(Boolean)
    .includes(requiredGrade);
}

function getCosmeticGradeSortRank(value) {
  const canonicalGrade = getCanonicalCosmeticGrade(value);
  return canonicalGrade ? (CANONICAL_GRADE_ORDER.get(canonicalGrade) ?? 999) : 999;
}

module.exports = {
  CANONICAL_COSMETIC_GRADES,
  cosmeticGradeLabelsMatch,
  getCanonicalCosmeticGrade,
  getCanonicalCosmeticGradeFromOption,
  getCosmeticGradeSortRank,
  isNotYetGradedToken,
  normalizeCosmeticGradeOptions,
  normalizeCosmeticGradeRequirementOptions,
  normalizeCosmeticGradeToken
};
