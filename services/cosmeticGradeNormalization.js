'use strict';

const CANONICAL_COSMETIC_GRADES = Object.freeze([
  Object.freeze({ code: 'a', value: 'A', label: 'A', sortOrder: 10 }),
  Object.freeze({ code: 'ab', value: 'AB', label: 'AB', sortOrder: 20 }),
  Object.freeze({ code: 'b', value: 'B', label: 'B', sortOrder: 30 }),
  Object.freeze({ code: 'c', value: 'C', label: 'C', sortOrder: 40 }),
  Object.freeze({ code: 'd', value: 'D', label: 'D', sortOrder: 50 })
]);

const CANONICAL_GRADE_BY_TOKEN = new Map([
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

function normalizeCosmeticGradeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(cosmetic_)?grade_/, '')
    .replace(/_grade$/, '');
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
  for (const candidate of [option.code, option.label, option.value]) {
    const grade = getCanonicalCosmeticGrade(candidate);

    if (grade) {
      return grade;
    }
  }

  return null;
}

function getCosmeticGradeOptionPriority(option = {}, canonicalGrade) {
  const source = String(option.source || option.categoryCode || option.category_code || '').trim().toLowerCase();
  const code = String(option.code || '').trim().toLowerCase();
  const label = String(option.label || '').trim().toUpperCase();
  const value = String(option.rawValue || option.databaseValue || option.value || '').trim().toUpperCase();
  let priority = 0;

  if (source === 'cosmetic_grades') {
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

function normalizeCosmeticGradeOptions(options) {
  const groups = new Map();

  (Array.isArray(options) ? options : []).forEach((option) => {
    const canonicalGrade = getCanonicalCosmeticGradeFromOption(option);

    if (!canonicalGrade) {
      return;
    }

    const candidate = {
      ...option,
      code: canonicalGrade.toLowerCase(),
      label: canonicalGrade,
      canonicalGrade
    };
    const priority = getCosmeticGradeOptionPriority(option, canonicalGrade);
    const configValueId = getConfigValueIdFromOption(option);
    const existing = groups.get(canonicalGrade) || {
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

    groups.set(canonicalGrade, existing);
  });

  return Array.from(groups.values())
    .map((entry) => ({
      ...entry.option,
      filterIds: entry.filterIds,
      legacyValues: entry.legacyValues
    }))
    .sort((left, right) => (
      (CANONICAL_GRADE_ORDER.get(left.canonicalGrade) ?? 999)
      - (CANONICAL_GRADE_ORDER.get(right.canonicalGrade) ?? 999)
    ));
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
