'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CANONICAL_COSMETIC_GRADES,
  cosmeticGradeLabelsMatch,
  getCanonicalCosmeticGrade,
  getCosmeticGradeSortRank,
  normalizeCosmeticGradeOptions,
  normalizeCosmeticGradeRequirementOptions
} = require('./cosmeticGradeNormalization');

test('Cosmetic Grades have one canonical database vocabulary with Supreme S above A', () => {
  assert.deepEqual(
    CANONICAL_COSMETIC_GRADES.map(({ code, value, label }) => ({ code, value, label })),
    [
      { code: 's', value: 'S', label: 'S' },
      { code: 'a', value: 'A', label: 'A' },
      { code: 'ab', value: 'AB', label: 'AB' },
      { code: 'b', value: 'B', label: 'B' },
      { code: 'c', value: 'C', label: 'C' },
      { code: 'd', value: 'D', label: 'D' }
    ]
  );
});

test('legacy display wording normalizes to the canonical letter without becoming a separate grade', () => {
  for (const value of ['S', 'Grade S', 'Cosmetic Grade S', 'Supreme', 'Supreme Grade', 'grade_s']) {
    assert.equal(getCanonicalCosmeticGrade(value), 'S', value);
  }
  for (const value of ['A', 'Grade A', 'Cosmetic Grade A', 'grade_a', 'cosmetic_grade_a']) {
    assert.equal(getCanonicalCosmeticGrade(value), 'A', value);
  }
  for (const value of ['AB', 'Grade AB', 'Cosmetic Grade AB', 'A/B', 'A-B', 'grade_ab']) {
    assert.equal(getCanonicalCosmeticGrade(value), 'AB', value);
  }
  assert.equal(getCanonicalCosmeticGrade('Not Yet Graded'), null);
});

test('grade options collapse legacy duplicates and prefer canonical cosmetic_grades values', () => {
  const options = normalizeCosmeticGradeOptions([
    { id: 5, categoryCode: 'cosmetic_grades', code: 's', label: 'S', value: 'S' },
    { id: 20, categoryCode: 'unit_grades', code: 'grade_a', label: 'Grade A', value: 'A' },
    { id: 10, categoryCode: 'cosmetic_grades', code: 'a', label: 'A', value: 'A' },
    { id: 30, categoryCode: 'overall_unit_grades', code: 'cosmetic_grade_a', label: 'Cosmetic Grade A', value: 'A' },
    { id: 40, categoryCode: 'cosmetic_grades', code: 'ab', label: 'AB', value: 'AB' },
    { id: 50, categoryCode: 'cosmetic_grades', code: 'b', label: 'B', value: 'B' },
    { id: 60, categoryCode: 'cosmetic_grades', code: 'not_yet_graded', label: 'Not Yet Graded', value: 'N/A' }
  ]);

  assert.deepEqual(options.map((option) => option.label), ['S', 'A', 'AB', 'B']);
  assert.equal(options[1].id, 10);
  assert.deepEqual(options[1].filterIds.sort((a, b) => a - b), [10, 20, 30]);
});

test('Requirement options store/select one config value per canonical grade', () => {
  const options = normalizeCosmeticGradeRequirementOptions([
    { value: 'config_value:5', source: 'cosmetic_grades', code: 's', label: 'S' },
    { value: 'config_value:22', source: 'unit_grades', code: 'grade_a', label: 'Grade A' },
    { value: 'config_value:11', source: 'cosmetic_grades', code: 'a', label: 'A' },
    { value: 'config_value:33', source: 'cosmetic_grades', code: 'ab', label: 'AB' }
  ]);

  assert.deepEqual(options.map((option) => [option.label, option.value]), [
    ['S', 'config_value:5'],
    ['A', 'config_value:11'],
    ['AB', 'config_value:33']
  ]);
});



test('configured Cosmetic Grades preserve configured labels/order and include custom values', () => {
  const options = normalizeCosmeticGradeOptions([
    { id: 5, systemConfigCategoryId: 7, systemConfigValueId: 506, label: 'Supreme', value: 'S', sortOrder: 5 },
    { id: 8, systemConfigCategoryId: 7, label: 'A+', value: 'A+', sortOrder: 8 },
    { id: 10, systemConfigCategoryId: 7, systemConfigValueId: 501, label: 'A', value: 'A', sortOrder: 10 },
    { id: 12, systemConfigCategoryId: 7, label: 'A-', value: 'A-', sortOrder: 15 },
    { id: 20, systemConfigCategoryId: 7, systemConfigValueId: 502, label: 'AB', value: 'AB', sortOrder: 20 }
  ]);

  assert.deepEqual(options.map((option) => option.label), ['Supreme', 'A+', 'A', 'A-', 'AB']);
  assert.equal(options[0].canonicalGrade, 'S');
  assert.equal(options[1].canonicalGrade, null);
  assert.equal(options[3].canonicalGrade, null);
  assert.equal(options[0].requiresCosmeticIssue, false);
  assert.equal(options[1].requiresCosmeticIssue, false);
  assert.equal(options[2].requiresCosmeticIssue, false);
  assert.equal(options[3].requiresCosmeticIssue, true);
  assert.equal(options[4].requiresCosmeticIssue, true);
});

test('Cosmetic Grade comparisons and ordering place Supreme S above A and AB between A and B', () => {
  assert.equal(cosmeticGradeLabelsMatch('Supreme Grade', 'S'), true);
  assert.equal(cosmeticGradeLabelsMatch('Grade A', 'A'), true);
  assert.equal(cosmeticGradeLabelsMatch('Cosmetic Grade AB', 'AB'), true);
  assert.equal(cosmeticGradeLabelsMatch('AB', 'B'), false);
  assert.ok(getCosmeticGradeSortRank('S') < getCosmeticGradeSortRank('A'));
  assert.ok(getCosmeticGradeSortRank('A') < getCosmeticGradeSortRank('AB'));
  assert.ok(getCosmeticGradeSortRank('AB') < getCosmeticGradeSortRank('B'));
});
