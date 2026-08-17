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
  assert.match(expandedModel, /SYSTEM_CONFIG_CATEGORY_IDS\.COSMETIC_GRADES/);
  assert.match(controller, /Choose a valid Cosmetic Grade: A, AB, B, C, or D\./);
});

test('Lot defaults use the numeric Cosmetic Grades system category identity', () => {
  const lotModel = read('models/lotModel.js');
  assert.match(lotModel, /listConfigValuesForSystemCategory\(SYSTEM_CONFIG_CATEGORY_IDS\.COSMETIC_GRADES\)/);
  assert.doesNotMatch(lotModel, /listConfigValuesForFirstExistingCategory\(\['cosmetic_grades'/);
});

test('dashboard and Unit Browser grade ordering place AB between A and B by numeric system value identity', () => {
  const dashboard = read('models/dashboardModel.js');
  const browserModel = read('models/techUnitModel.js');

  for (const model of [dashboard, browserModel]) {
    assert.match(model, /SYSTEM_CONFIG_VALUE_IDS\.COSMETIC_GRADE_A/);
    assert.match(model, /SYSTEM_CONFIG_VALUE_IDS\.COSMETIC_GRADE_AB/);
    assert.match(model, /SYSTEM_CONFIG_VALUE_IDS\.COSMETIC_GRADE_B/);
    assert.match(model, /SYSTEM_CONFIG_VALUE_IDS\.COSMETIC_GRADE_C/);
    assert.match(model, /SYSTEM_CONFIG_VALUE_IDS\.COSMETIC_GRADE_D/);
  }
  assert.match(dashboard, /COSMETIC_GRADE_BY_SYSTEM_VALUE_ID/);
});

test('canonical Cosmetic Grade migration is audit-first and remaps all known grade references using numeric bindings', () => {
  const script = read('scripts/migrateCanonicalCosmeticGrades.js');

  assert.match(script, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(script, /Canonical Cosmetic Grade policy: A, AB, B, C, D/);
  assert.match(script, /SYSTEM_CONFIG_CATEGORY_IDS\.COSMETIC_GRADES/);
  assert.match(script, /SYSTEM_CONFIG_VALUE_IDS\.COSMETIC_GRADE_A/);
  assert.match(script, /system_config_categories/);
  assert.match(script, /system_config_values/);
  assert.match(script, /unit_grade_assessments', 'overall_grade_config_value_id'/);
  assert.match(script, /lots', 'default_grade_config_value_id'/);
  assert.match(script, /lot_requirements', 'requirement_config_value_id'/);
  assert.match(script, /clearCurrentNotYetGradedAssessments/);
  assert.match(script, /bindGradeValue/);
  assert.match(script, /deactivateRows/);
  assert.match(script, /No database changes were made\. Re-run with --apply/);
});


test('protected Cosmetic Grade configuration keeps stable IDs while allowing rename and deactivation', () => {
  const page = read('views/pages/management-config.ejs');
  const form = read('views/fragments/config-value-form-modal.ejs');
  const controller = read('controllers/configController.js');
  const model = read('models/configModel.js');

  assert.match(page, /value\.isProtected[\s\S]*?Protected/);
  assert.match(form, /database ID remains unchanged/);
  assert.match(form, /Renaming it also changes how current and historical records display this value/);
  assert.match(form, /It may be deactivated, but it cannot be deleted or moved to another category/);
  assert.match(controller, /Protected system values cannot be moved to a different configuration category/);
  assert.match(controller, /listActiveLotRequirementsReferencingConfigValue/);
  assert.match(model, /requirement_type_config_value_id/);
  assert.match(model, /comparison_operator_config_value_id/);
  assert.match(model, /requirement_config_value_id/);
  assert.match(model, /is_protected/);
  assert.doesNotMatch(form, /name="code"/);
});

test('package exposes audit, migration, and validation commands for canonical grades', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:cosmetic-grades'], 'node scripts/migrateCanonicalCosmeticGrades.js');
  assert.equal(packageJson.scripts['migrate:cosmetic-grades'], 'node scripts/migrateCanonicalCosmeticGrades.js --apply');
  assert.match(packageJson.scripts['validate:cosmetic-grades'], /cosmeticGradeNormalization\.test\.js/);
  assert.match(packageJson.scripts['validate:cosmetic-grades'], /stage10w172CanonicalCosmeticGradesIntegration\.test\.js/);
});
