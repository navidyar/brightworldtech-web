'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('regular Tech non-A Cosmetic Grades force Cosmetic Issues visible and required', () => {
  const controller = read('controllers/techController.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const script = read('public/js/tech-unit-form.js');

  const policy = read('services/regularTechCosmeticIssuePolicy.js');
  assert.match(policy, /NON_A_COSMETIC_GRADES = new Set\(\['AB', 'B', 'C', 'D'\]\)/);
  assert.match(controller, /requiresActualCosmeticIssueForNonAGrade: isRegularTechUnitBrowserUser\(req\)/);
  assert.match(controller, /resolveRegularTechCosmeticIssuePolicy\(/);
  assert.match(policy, /field && field\.key === 'cosmetic_issues'[\s\S]*visible: true,[\s\S]*required: true/);
  assert.match(form, /data-require-actual-cosmetic-issue-for-non-a-grade=/);
  assert.match(form, /data-cosmetic-grade-select/);
  assert.match(form, /data-cosmetic-grade="<%= gradeOption\.canonicalGrade \|\| gradeOption\.label %>"/);
  assert.match(script, /NON_A_COSMETIC_GRADES = new Set\(\['AB', 'B', 'C', 'D'\]\)/);
  assert.match(script, /const visible = lotVisible \|\| gradeRequired;/);
  assert.match(script, /const required = lotRequired \|\| gradeRequired;/);
});

test('Grade A remains exempt while None cannot satisfy AB, B, C, or D for regular Techs', () => {
  const controller = read('controllers/techController.js');
  const policy = read('services/regularTechCosmeticIssuePolicy.js');
  const script = read('public/js/tech-unit-form.js');

  assert.doesNotMatch(policy, /NON_A_COSMETIC_GRADES = new Set\([^\n]*'A'/);
  assert.match(policy, /row\.isNoIssue !== '1'/);
  assert.match(policy, /isPositiveInteger\(row\.issueTypeConfigValueId\)/);
  assert.match(policy, /isPositiveInteger\(row\.severityConfigValueId\)/);
  assert.match(policy, /isPositiveInteger\(row\.locationConfigValueId\)/);
  assert.match(controller, /code: 'regular_tech_non_a_grade'/);
  assert.match(script, /row\.getAttribute\('data-cosmetic-no-issue'\) !== 'true'/);
  assert.match(script, /NON_A_COSMETIC_ISSUE_REQUIRED_MESSAGE/);
});

test('existing non-A grades still enforce the rule when the Lot hides Cosmetic Grade on Edit', () => {
  const policy = read('services/regularTechCosmeticIssuePolicy.js');

  assert.match(policy, /const useExistingGrade = mode === 'edit' && gradeField && !gradeField\.visible;/);
  assert.match(policy, /useExistingGrade[\s\S]*existingFormData\?\.overallGradeConfigValueId[\s\S]*formData\?\.overallGradeConfigValueId/);
});

test('the dynamic rule is reapplied after Lot profile changes and grade changes', () => {
  const script = read('public/js/tech-unit-form.js');

  assert.match(script, /function applyRegularTechCosmeticIssuePolicy\(form\)/);
  assert.match(script, /applyDefaultLotUnitFormProfile[\s\S]*applyRegularTechCosmeticIssuePolicy\(form\)/);
  assert.match(script, /applyLotUnitFormProfile[\s\S]*applyRegularTechCosmeticIssuePolicy\(form\)/);
  assert.match(script, /const cosmeticGradeSelect = event\.target\.closest\('\[data-cosmetic-grade-select\]'\);[\s\S]*applyRegularTechCosmeticIssuePolicy\(form\)/);
});

test('Tech Unit entry points cache-bust the changed form controller', () => {
  for (const file of ['views/pages/tech-units.ejs', 'views/pages/tech-unit-detail.ejs', 'views/pages/tech-unit-form.ejs']) {
    assert.match(read(file), /tech-unit-form\.js\?v=[^"\'\s>]+/);
  }
});
