'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasCompleteActualCosmeticIssue,
  resolveRegularTechCosmeticIssuePolicy
} = require('./regularTechCosmeticIssuePolicy');

const overallGradeOptions = [
  { id: 5, canonicalGrade: 'S', label: 'S', filterIds: [5], requiresCosmeticIssue: false },
  { id: 10, canonicalGrade: 'A', label: 'A', filterIds: [10], requiresCosmeticIssue: false },
  { id: 15, canonicalGrade: null, label: 'A-', filterIds: [15], requiresCosmeticIssue: true },
  { id: 20, canonicalGrade: 'AB', label: 'AB', filterIds: [20, 120], requiresCosmeticIssue: true },
  { id: 30, canonicalGrade: 'B', label: 'B', filterIds: [30], requiresCosmeticIssue: true },
  { id: 40, canonicalGrade: 'C', label: 'C', filterIds: [40], requiresCosmeticIssue: true },
  { id: 50, canonicalGrade: 'D', label: 'D', filterIds: [50], requiresCosmeticIssue: true }
];

function profile({ gradeVisible = true, issuesVisible = false, issuesRequired = false } = {}) {
  const fields = [
    { key: 'overall_grade', visible: gradeVisible, required: false },
    { key: 'cosmetic_issues', visible: issuesVisible, required: issuesRequired, requiredSuppressedByHidden: issuesRequired && !issuesVisible }
  ];
  return { selectedLot: { lotId: 1 }, fields, fieldsByKey: new Map(fields.map((field) => [field.key, field])) };
}

function options(required = true) {
  return { overallGradeOptions, requiresActualCosmeticIssueForLowerGrades: required };
}

test('S and A are exempt from the regular-Tech cosmetic issue override while AB through D still require issues', () => {
  const supreme = resolveRegularTechCosmeticIssuePolicy({ mode: 'create', formData: { overallGradeConfigValueId: '5' }, profile: profile(), formOptions: options() });
  const a = resolveRegularTechCosmeticIssuePolicy({ mode: 'create', formData: { overallGradeConfigValueId: '10' }, profile: profile(), formOptions: options() });
  const ab = resolveRegularTechCosmeticIssuePolicy({ mode: 'create', formData: { overallGradeConfigValueId: '20' }, profile: profile(), formOptions: options() });
  const b = resolveRegularTechCosmeticIssuePolicy({ mode: 'create', formData: { overallGradeConfigValueId: '30' }, profile: profile(), formOptions: options() });
  const c = resolveRegularTechCosmeticIssuePolicy({ mode: 'create', formData: { overallGradeConfigValueId: '40' }, profile: profile(), formOptions: options() });
  const d = resolveRegularTechCosmeticIssuePolicy({ mode: 'create', formData: { overallGradeConfigValueId: '50' }, profile: profile(), formOptions: options() });

  assert.equal(supreme.canonicalGrade, 'S');
  assert.equal(supreme.requiresActualCosmeticIssue, false);
  assert.equal(a.requiresActualCosmeticIssue, false);
  for (const result of [ab, b, c, d]) {
    assert.equal(result.requiresActualCosmeticIssue, true);
    const issues = result.profile.fieldsByKey.get('cosmetic_issues');
    assert.equal(issues.visible, true);
    assert.equal(issues.required, true);
  }
});


test('configured custom grades can carry the lower-grade Cosmetic Issue rule', () => {
  const result = resolveRegularTechCosmeticIssuePolicy({
    mode: 'create',
    formData: { overallGradeConfigValueId: '15' },
    profile: profile(),
    formOptions: options()
  });

  assert.equal(result.canonicalGrade, null);
  assert.equal(result.requiresActualCosmeticIssue, true);
});

test('non-Tech roles do not receive the cross-field override', () => {
  const result = resolveRegularTechCosmeticIssuePolicy({
    mode: 'create',
    formData: { overallGradeConfigValueId: '30' },
    profile: profile(),
    formOptions: options(false)
  });

  assert.equal(result.requiresActualCosmeticIssue, false);
  assert.equal(result.profile.fieldsByKey.get('cosmetic_issues').visible, false);
});

test('Edit uses the existing lower grade when the Lot hides Cosmetic Grade', () => {
  const result = resolveRegularTechCosmeticIssuePolicy({
    mode: 'edit',
    formData: { overallGradeConfigValueId: '' },
    existingFormData: { overallGradeConfigValueId: '20' },
    profile: profile({ gradeVisible: false }),
    formOptions: options()
  });

  assert.equal(result.canonicalGrade, 'AB');
  assert.equal(result.requiresActualCosmeticIssue, true);
});

test('legacy filter IDs resolve to the same canonical lower grade', () => {
  const result = resolveRegularTechCosmeticIssuePolicy({
    mode: 'create',
    formData: { overallGradeConfigValueId: '120' },
    profile: profile(),
    formOptions: options()
  });

  assert.equal(result.canonicalGrade, 'AB');
  assert.equal(result.requiresActualCosmeticIssue, true);
});

test('None never satisfies the actual Cosmetic Issue requirement', () => {
  assert.equal(hasCompleteActualCosmeticIssue({
    cosmeticIssues: [{ issueTypeConfigValueId: '1', severityConfigValueId: '', locationConfigValueId: '', isNoIssue: '1' }]
  }), false);
  assert.equal(hasCompleteActualCosmeticIssue({
    cosmeticIssues: [{ issueTypeConfigValueId: '2', severityConfigValueId: '3', locationConfigValueId: '4', isNoIssue: '' }]
  }), true);
  assert.equal(hasCompleteActualCosmeticIssue({
    cosmeticIssues: [{ issueTypeConfigValueId: '2', severityConfigValueId: '', locationConfigValueId: '4', isNoIssue: '' }]
  }), false);
});
