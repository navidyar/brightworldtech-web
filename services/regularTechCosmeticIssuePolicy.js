'use strict';

const { getCanonicalCosmeticGradeFromOption } = require('./cosmeticGradeNormalization');

const COSMETIC_ISSUE_REQUIRED_GRADES = new Set(['AB', 'B', 'C', 'D']);
const REGULAR_TECH_COSMETIC_ISSUE_MESSAGE = 'The selected Cosmetic Grade requires at least one actual Cosmetic Issue with severity and location for Tech users.';

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

function getEffectiveSubmittedCosmeticGradeOption({ mode, formData, existingFormData, profile, formOptions } = {}) {
  const gradeField = Array.isArray(profile?.fields)
    ? profile.fields.find((field) => field && field.key === 'overall_grade')
    : null;
  const useExistingGrade = mode === 'edit' && gradeField && !gradeField.visible;
  const gradeConfigValueId = useExistingGrade
    ? existingFormData?.overallGradeConfigValueId
    : formData?.overallGradeConfigValueId;
  const gradeOption = findSelectedCosmeticGradeOption(gradeConfigValueId, formOptions);

  return gradeOption;
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
  const gradeOption = getEffectiveSubmittedCosmeticGradeOption({
    mode,
    formData,
    existingFormData,
    profile,
    formOptions
  });
  const canonicalGrade = gradeOption ? getCanonicalCosmeticGradeFromOption(gradeOption) : null;
  const gradeRequiresIssue = gradeOption?.requiresCosmeticIssue === true
    || (gradeOption?.requiresCosmeticIssue === undefined && COSMETIC_ISSUE_REQUIRED_GRADES.has(canonicalGrade));
  const requiresActualCosmeticIssue = Boolean(
    formOptions?.requiresActualCosmeticIssueForLowerGrades
    && gradeRequiresIssue
  );

  return {
    canonicalGrade,
    requiresActualCosmeticIssue,
    profile: requiresActualCosmeticIssue ? forceCosmeticIssuesVisibleRequired(profile) : profile
  };
}

module.exports = {
  COSMETIC_ISSUE_REQUIRED_GRADES,
  REGULAR_TECH_COSMETIC_ISSUE_MESSAGE,
  forceCosmeticIssuesVisibleRequired,
  hasCompleteActualCosmeticIssue,
  resolveRegularTechCosmeticIssuePolicy
};
