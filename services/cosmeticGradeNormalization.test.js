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

test('Cosmetic Grades have one canonical database vocabulary including AB', () => {
  assert.deepEqual(
    CANONICAL_COSMETIC_GRADES.map(({ code, value, label }) => ({ code, value, label })),
    [
      { code: 'a', value: 'A', label: 'A' },
      { code: 'ab', value: 'AB', label: 'AB' },
      { code: 'b', value: 'B', label: 'B' },
      { code: 'c', value: 'C', label: 'C' },
      { code: 'd', value: 'D', label: 'D' }
    ]
  );
});

test('legacy display wording normalizes to the canonical letter without becoming a separate grade', () => {
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
    { id: 20, categoryCode: 'unit_grades', code: 'grade_a', label: 'Grade A', value: 'A' },
    { id: 10, categoryCode: 'cosmetic_grades', code: 'a', label: 'A', value: 'A' },
    { id: 30, categoryCode: 'overall_unit_grades', code: 'cosmetic_grade_a', label: 'Cosmetic Grade A', value: 'A' },
    { id: 40, categoryCode: 'cosmetic_grades', code: 'ab', label: 'AB', value: 'AB' },
    { id: 50, categoryCode: 'cosmetic_grades', code: 'b', label: 'B', value: 'B' },
    { id: 60, categoryCode: 'cosmetic_grades', code: 'not_yet_graded', label: 'Not Yet Graded', value: 'N/A' }
  ]);

  assert.deepEqual(options.map((option) => option.label), ['A', 'AB', 'B']);
  assert.equal(options[0].id, 10);
  assert.deepEqual(options[0].filterIds.sort((a, b) => a - b), [10, 20, 30]);
});

test('Requirement options store/select one config value per canonical grade', () => {
  const options = normalizeCosmeticGradeRequirementOptions([
    { value: 'config_value:22', source: 'unit_grades', code: 'grade_a', label: 'Grade A' },
    { value: 'config_value:11', source: 'cosmetic_grades', code: 'a', label: 'A' },
    { value: 'config_value:33', source: 'cosmetic_grades', code: 'ab', label: 'AB' }
  ]);

  assert.deepEqual(options.map((option) => [option.label, option.value]), [
    ['A', 'config_value:11'],
    ['AB', 'config_value:33']
  ]);
});

test('Cosmetic Grade comparisons and ordering understand AB', () => {
  assert.equal(cosmeticGradeLabelsMatch('Grade A', 'A'), true);
  assert.equal(cosmeticGradeLabelsMatch('Cosmetic Grade AB', 'AB'), true);
  assert.equal(cosmeticGradeLabelsMatch('AB', 'B'), false);
  assert.ok(getCosmeticGradeSortRank('A') < getCosmeticGradeSortRank('AB'));
  assert.ok(getCosmeticGradeSortRank('AB') < getCosmeticGradeSortRank('B'));
});
