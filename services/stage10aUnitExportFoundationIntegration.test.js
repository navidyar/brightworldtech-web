'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Battery Health is registered, validated, stored, audited, and exposed in the Unit form', () => {
  const registry = read('config/unitFormFieldRegistry.js');
  const bindings = read('services/unitFormSubmissionPolicy.js');
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');
  const audit = read('services/unitAuditSnapshot.js');
  const form = read('views/fragments/tech-unit-form.ejs');

  assert.match(registry, /configurableField\('battery_health', 'Battery Health'[\s\S]*?batteryHealthPercent[\s\S]*?units\.battery_health_percent/);
  assert.match(bindings, /battery_health:[\s\S]*?batteryHealthPercent/);
  assert.match(controller, /isNumberInRangeWithPrecision\(validationFormData\.batteryHealthPercent, 0, 100, 1\)/);
  assert.match(model, /battery_health_percent/);
  assert.match(audit, /\['battery_health', 'Battery Health', 'batteryHealthPercent'/);
  assert.match(form, /name="batteryHealthPercent"[\s\S]*?min="0"[\s\S]*?max="100"[\s\S]*?step="0\.1"/);
});

test('Battery Health participates in Lot visibility and numeric requirements', () => {
  const registry = read('config/lotRequirementRegistry.js');
  const formPolicy = read('config/lotRequirementFormPolicy.js');
  const evaluator = read('services/lotRequirementEvaluator.js');
  const validationModel = read('models/lotValidationModel.js');

  assert.match(registry, /key: 'battery_health'[\s\S]*?storageKind: 'number'[\s\S]*?unitSuffix: '%'/);
  assert.match(formPolicy, /battery_health: 'battery_health'/);
  assert.match(evaluator, /battery_health:[\s\S]*?baseRow\.battery_health_percent/);
  assert.match(validationModel, /u\.battery_health_percent/);
});

test('Processor Families provide the authoritative export Short Form', () => {
  const model = read('models/processorFamilyModel.js');
  const controller = read('controllers/processorFamilyController.js');
  const modal = read('views/fragments/processor-family-form-modal.ejs');
  const page = read('views/pages/processor-families.ejs');
  const unitModel = read('models/techUnitModel.js');

  assert.match(model, /export_short_form/);
  assert.match(controller, /shortForm/);
  assert.match(modal, /name="shortForm"[\s\S]*?i5-13th/);
  assert.match(page, /<th>Short Form<\/th>/);
  assert.match(unitModel, /processor_export_short_forms/);
  assert.match(unitModel, /processorShortForm:/);
});

test('export preview route is limited to Admin and Management and uses current filters', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');
  const page = read('views/pages/tech-units.ejs');

  assert.match(routes, /'\/tech\/units\/export\/preview'[\s\S]*?requireRole\(managementRoles\)[\s\S]*?renderTechUnitsExportPreview/);
  assert.match(controller, /buildFilteredUnitExportDataset\(filters\)/);
  assert.match(controller, /buildTechUnitsExportPreviewUrl/);
  assert.match(page, /canExportTechUnits[\s\S]*?\['admin', 'management'\][\s\S]*?Export Preview/);
});

test('Stage 10A migration is idempotent and validates both new columns', () => {
  const sql = read('sql/2026-07-stage-10a-unit-export-foundation.sql');
  const applyScript = read('scripts/apply-stage-10a-unit-export-foundation.sh');

  assert.match(sql, /information_schema\.COLUMNS/);
  assert.match(sql, /battery_health_percent DECIMAL\(5,1\) UNSIGNED/);
  assert.match(sql, /MODIFY COLUMN battery_health_percent DECIMAL\(5,1\) UNSIGNED NULL/);
  assert.match(sql, /export_short_form VARCHAR\(40\)/);
  assert.match(sql, /chk_units_battery_health_percent/);
  assert.match(sql, /intel-i\[357\]/);
  assert.match(applyScript, /existing battery_health_percent contains/);
  assert.match(applyScript, /expected 1:1:1:0:0/);
  assert.doesNotMatch(applyScript, /MYSQL_ROOT_PASSWORD|-u root/);
});
