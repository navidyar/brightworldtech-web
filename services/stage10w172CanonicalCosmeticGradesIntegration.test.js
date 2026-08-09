'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Add/Edit Unit presents canonical letter grades including AB and accepts legacy current IDs', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const expandedModel = read('models/unitExpandedFormModel.js');
  const controller = read('controllers/techController.js');

  assert.match(form, /Cosmetic Grade A, AB, B, C, or D/);
  assert.match(form, /A, AB, B, C, or D is cosmetic only/);
  assert.match(form, /gradeOption\.filterIds/);
  assert.match(expandedModel, /normalizeCosmeticGradeOptions\(rawOverallGradeOptions\)/);
  assert.match(expandedModel, /resolveCanonicalCosmeticGradeConfigValueId/);
  assert.match(expandedModel, /cc\.code = 'cosmetic_grades'/);
  assert.match(controller, /Choose a valid Cosmetic Grade: A, AB, B, C, or D\./);
});

test('Lot defaults prefer the single Cosmetic Grades category', () => {
  const lotModel = read('models/lotModel.js');
  assert.match(
    lotModel,
    /listConfigValuesForFirstExistingCategory\(\['cosmetic_grades', 'overall_unit_grades', 'unit_grades', 'unit_grade', 'grades'\]\)/
  );
});

test('dashboard and Unit Browser grade ordering place AB between A and B', () => {
  const dashboard = read('models/dashboardModel.js');
  const browserModel = read('models/techUnitModel.js');
  assert.match(dashboard, /WHEN 'a' THEN 10\s+WHEN 'ab' THEN 20\s+WHEN 'b' THEN 30\s+WHEN 'c' THEN 40\s+WHEN 'd' THEN 50/);
  assert.match(dashboard, /getCanonicalCosmeticGrade\(rawValue\)/);
  assert.match(browserModel, /= 'a' THEN 10\s+WHEN \${gradeValueSql} = 'ab' THEN 20\s+WHEN \${gradeValueSql} = 'b' THEN 30/);
});

test('canonical Cosmetic Grade migration is audit-first and remaps all known grade references', () => {
  const script = read('scripts/migrateCanonicalCosmeticGrades.js');

  assert.match(script, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(script, /Canonical Cosmetic Grade policy: A, AB, B, C, D/);
  assert.match(script, /unit_grade_assessments', 'overall_grade_config_value_id'/);
  assert.match(script, /lots', 'default_grade_config_value_id'/);
  assert.match(script, /lot_requirements', 'requirement_config_value_id'/);
  assert.match(script, /clearCurrentNotYetGradedAssessments/);
  assert.match(script, /deactivateNonCanonicalGradeValues/);
  assert.match(script, /deactivateLegacyCategories/);
  assert.match(script, /No database changes were made\. Re-run with --apply/);
});


test('Cosmetic Grade configuration is view-only so canonical database values cannot drift', () => {
  const page = read('views/pages/management-config.ejs');
  const form = read('views/fragments/config-value-form-modal.ejs');
  const controller = read('controllers/configController.js');

  assert.match(page, /canonicalCosmeticGrades/);
  assert.match(page, /Canonical \/ read-only/);
  assert.match(page, /System-managed/);
  assert.match(form, /cosmetic_grades' \? 'disabled'/);
  assert.match(controller, /CANONICAL_COSMETIC_GRADES_READ_ONLY/);
  assert.match(controller, /Cosmetic Grades are system-managed canonical values \(A, AB, B, C, D\)/);
});

test('package exposes audit, migration, and validation commands for canonical grades', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:cosmetic-grades'], 'node scripts/migrateCanonicalCosmeticGrades.js');
  assert.equal(packageJson.scripts['migrate:cosmetic-grades'], 'node scripts/migrateCanonicalCosmeticGrades.js --apply');
  assert.match(packageJson.scripts['validate:cosmetic-grades'], /cosmeticGradeNormalization\.test\.js/);
  assert.match(packageJson.scripts['validate:cosmetic-grades'], /stage10w172CanonicalCosmeticGradesIntegration\.test\.js/);
});
