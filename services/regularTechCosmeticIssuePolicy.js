'use strict';

const { getCanonicalCosmeticGradeFromOption } = require('./cosmeticGradeNormalization');

const NON_A_COSMETIC_GRADES = new Set(['AB', 'B', 'C', 'D']);
const REGULAR_TECH_COSMETIC_ISSUE_MESSAGE = 'Cosmetic Grade AB, B, C, or D requires at least one actual Cosmetic Issue with severity and location for Tech users.';

function isPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function findSelectedCosmeticGradeOption(configValueId, formOptions = {}) {
  const selectedGradeId = Number(configValueId);

  if (!Number.isSafeInteger(selectedGradeId) || selectedGradeId <= 0) {
    return null;
  }

  return (Array.isArray(formOptions.overallGradeOptions) ? formOptions.overallGradeOptions : [])
    .find((option) => (
      Number(option.id) === selectedGradeId
      || (Array.isArray(option.filterIds) && option.filterIds.includes(selectedGradeId))
    )) || null;
}

function getEffectiveSubmittedCosmeticGrade({ mode, formData, existingFormData, profile, formOptions } = {}) {
  const gradeField = Array.isArray(profile?.fields)
    ? profile.fields.find((field) => field && field.key === 'overall_grade')
    : null;
  const useExistingGrade = mode === 'edit' && gradeField && !gradeField.visible;
  const gradeConfigValueId = useExistingGrade
    ? existingFormData?.overallGradeConfigValueId
    : formData?.overallGradeConfigValueId;
  const gradeOption = findSelectedCosmeticGradeOption(gradeConfigValueId, formOptions);

  return gradeOption ? getCanonicalCosmeticGradeFromOption(gradeOption) : null;
}

function forceCosmeticIssuesVisibleRequired(profile) {
  if (!profile || !Array.isArray(profile.fields)) {
    return profile;
  }

  const fields = profile.fields.map((field) => (
    field && field.key === 'cosmetic_issues'
      ? Object.freeze({
          ...field,
          visible: true,
          required: true,
          requiredSuppressedByHidden: false
        })
      : field
  ));

  return {
    ...profile,
    fields: Object.freeze(fields),
    fieldsByKey: new Map(fields.map((field) => [field.key, field]))
  };
}

function hasCompleteActualCosmeticIssue(formData = {}) {
  return (Array.isArray(formData.cosmeticIssues) ? formData.cosmeticIssues : []).some((row) => (
    row
    && row.isNoIssue !== '1'
    && isPositiveInteger(row.issueTypeConfigValueId)
    && isPositiveInteger(row.severityConfigValueId)
    && isPositiveInteger(row.locationConfigValueId)
  ));
}

function resolveRegularTechCosmeticIssuePolicy({ mode, formData, existingFormData, profile, formOptions } = {}) {
  const canonicalGrade = getEffectiveSubmittedCosmeticGrade({
    mode,
    formData,
    existingFormData,
    profile,
    formOptions
  });
  const requiresActualCosmeticIssue = Boolean(
    formOptions?.requiresActualCosmeticIssueForNonAGrade
    && NON_A_COSMETIC_GRADES.has(canonicalGrade)
  );

  return {
    canonicalGrade,
    requiresActualCosmeticIssue,
    profile: requiresActualCosmeticIssue ? forceCosmeticIssuesVisibleRequired(profile) : profile
  };
}

module.exports = {
  NON_A_COSMETIC_GRADES,
  REGULAR_TECH_COSMETIC_ISSUE_MESSAGE,
  forceCosmeticIssuesVisibleRequired,
  hasCompleteActualCosmeticIssue,
  resolveRegularTechCosmeticIssuePolicy
};
