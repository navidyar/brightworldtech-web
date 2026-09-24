'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Add/Edit Unit uses configured Cosmetic Grade values while preserving legacy canonical IDs', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const expandedModel = read('models/unitExpandedFormModel.js');
  const controller = read('controllers/techController.js');

  assert.match(form, /Cosmetic Grade describes appearance only/);
  assert.match(form, /Grade options and order are managed in Configuration/);
  assert.match(form, /gradeOption\.filterIds/);
  assert.match(form, /data-requires-cosmetic-issue=/);
  assert.match(expandedModel, /normalizeCosmeticGradeOptions\(rawOverallGradeOptions\)/);
  assert.match(expandedModel, /resolveCanonicalCosmeticGradeConfigValueId/);
  assert.match(expandedModel, /belongsToCosmeticGradeCategory/);
  assert.match(expandedModel, /SYSTEM_CONFIG_CATEGORY_IDS\.COSMETIC_GRADES/);
  assert.match(controller, /Choose a valid active Cosmetic Grade\./);
});

test('Lot defaults use the numeric Cosmetic Grades system category identity', () => {
  const lotModel = read('models/lotModel.js');
  assert.match(lotModel, /listConfigValuesForSystemCategory\(SYSTEM_CONFIG_CATEGORY_IDS\.COSMETIC_GRADES\)/);
  assert.doesNotMatch(lotModel, /listConfigValuesForFirstExistingCategory\(\['cosmetic_grades'/);
});

test('dashboard and Unit Browser use configured Cosmetic Grade sort order', () => {
  const dashboard = read('models/dashboardModel.js');
  const browserModel = read('models/techUnitModel.js');

  assert.match(dashboard, /COALESCE\(grade\.sort_order, 999998\) AS grade_sort_order/);
  assert.match(dashboard, /ORDER BY grade_sort_order, grade\.label/);
  assert.match(browserModel, /COALESCE\(current_grade_value\.sort_order, 999998\)/);
  assert.match(browserModel, /Number\(left\.sortOrder \?\? 999999\)/);
  assert.match(dashboard, /COSMETIC_GRADE_BY_SYSTEM_VALUE_ID/);
});

test('canonical Unit Grade migration consolidates duplicate grade categories without replacing stable IDs', () => {
  const script = read('scripts/migrateCanonicalCosmeticGrades.js');
  const registry = read('config/configIdentityRegistry.js');

  assert.match(script, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(script, /Canonical Cosmetic Grade policy: S \(Supreme\), A, AB, B, C, D/);
  assert.match(script, /SYSTEM_CONFIG_CATEGORY_IDS\.COSMETIC_GRADES/);
  assert.match(registry, /SYSTEM_CONFIG_CATEGORY_IDS\.COSMETIC_GRADES, 'Unit Grades'/);
  assert.match(script, /SYSTEM_CONFIG_VALUE_IDS\.COSMETIC_GRADE_S/);
  assert.match(script, /system_config_categories/);
  assert.match(script, /system_config_values/);
  assert.match(script, /preserveConfiguredPresentation/);
  assert.match(script, /Authoritative Unit Grades category ID/);
  assert.match(script, /loadGradeCategories/);
  assert.match(script, /normalizeUnitGradesCategory/);
  assert.match(script, /deactivateLegacyGradeCategories/);
  assert.match(script, /Legacy custom grade values requiring manual review/);
  assert.match(script, /Additional configurable grade values found/);
  assert.doesNotMatch(script, /DELETE FROM config_categories/);
  assert.match(script, /No database changes were made\. Re-run with --apply/);
});


test('protected canonical Unit Grades keep stable IDs while Configuration controls labels, active state, order, and custom values', () => {
  const page = read('views/pages/management-config.ejs');
  const form = read('views/fragments/config-value-form-modal.ejs');
  const controller = read('controllers/configController.js');
  const model = read('models/configModel.js');

  assert.match(page, /Unit Grades are the single application-wide grade configuration/);
  assert.match(page, /Add, rename, activate\/deactivate, and reorder grades here/);
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
  assert.match(model, /isRetiredLegacyUnitGradeCategory/);
  assert.match(model, /hasAuthoritativeUnitGrades/);
  assert.doesNotMatch(form, /name="code"/);
});

test('package exposes audit, migration, and validation commands for configurable grades', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:cosmetic-grades'], 'node scripts/migrateCanonicalCosmeticGrades.js');
  assert.equal(packageJson.scripts['migrate:cosmetic-grades'], 'node scripts/migrateCanonicalCosmeticGrades.js --apply');
  assert.match(packageJson.scripts['validate:configurable-port-grades'], /cosmeticGradeNormalization\.test\.js/);
  assert.match(packageJson.scripts['validate:configurable-port-grades'], /configurablePortGradeOptionsIntegration\.test\.js/);
});
