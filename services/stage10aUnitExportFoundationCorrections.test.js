'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeRequirementNumber } = require('./lotRequirementNumberPolicy');
const { getLotRequirementField } = require('../config/lotRequirementRegistry');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Battery Health accepts tenths but rejects extra precision and out-of-range values', () => {
  const field = getLotRequirementField('battery_health');
  assert.deepEqual(analyzeRequirementNumber(field, '87.5'), { valid: true, numericValue: 87.5, message: '' });
  assert.equal(analyzeRequirementNumber(field, '87.55').valid, false);
  assert.equal(analyzeRequirementNumber(field, '100.1').valid, false);
  assert.equal(analyzeRequirementNumber(field, '0.0').valid, true);

  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(controller, /isNumberInRangeWithPrecision\(validationFormData\.batteryHealthPercent, 0, 100, 1\)/);
  assert.match(model, /normalizeOptionalDecimal\(formData\.batteryHealthPercent\)/);
  assert.match(form, /step="0\.1"[\s\S]*?placeholder="Example: 87\.5"/);
});

test('Lot requirement numeric presentation is field-specific', () => {
  const optionModel = read('models/requirementOptionModel.js');
  const script = read('public/js/lot-requirements.js');
  const modal = read('views/fragments/lot-requirement-form-modal.ejs');

  assert.equal(getLotRequirementField('storage_gb').exampleValue, '512');
  assert.equal(getLotRequirementField('battery_health').decimalPlaces, 1);
  assert.equal(getLotRequirementField('battery_health').exampleValue, '87.5');
  assert.match(optionModel, /numericInput:[\s\S]*?exampleValue/);
  assert.match(script, /textInput\.placeholder = exampleValue \? `Example: \$\{exampleValue\}`/);
  assert.match(script, /maximum === null[\s\S]*?removeAttribute\('max'\)/);
  assert.doesNotMatch(modal, /placeholder="Example: 512"/);
});

test('Lot Unit export is exposed only on Management Lot Details while legacy endpoints remain protected', () => {
  const managementRoutes = read('routes/management.js');
  const lotRoutes = read('routes/lots.js');
  const techPage = read('views/pages/tech-units.ejs');
  const lotPage = read('views/pages/management-lot-detail.ejs');

  assert.match(managementRoutes, /'\/tech\/units\/export\/preview'[\s\S]*?requireRole\(managementRoles\)/);
  assert.match(lotRoutes, /'\/management\/lots\/:lotId\/export\/preview'[\s\S]*?requireRole\(lotManagementRoles\)/);
  assert.doesNotMatch(techPage, /Export Preview/);
  assert.match(lotPage, />Export Units<\/button>/);
  assert.doesNotMatch(lotPage, />Export Direct Units<\/button>/);
  assert.doesNotMatch(lotPage, />Export Lot \+ Descendants<\/button>/);
});

test('Export preview provides an explicit horizontally scrollable table region', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const css = read('public/css/app.css');

  assert.match(modal, /class="table-scroll unit-export-preview-table-scroll"[\s\S]*?role="region"[\s\S]*?tabindex="0"/);
  assert.match(css, /\.table-scroll \{[\s\S]*?overflow-x: auto/);
  assert.match(css, /\.unit-export-preview-modal :is\(\.modal-body, \.site-clean-section\)[\s\S]*?min-width: 0/);
  assert.match(css, /\.unit-export-preview-table \{[\s\S]*?width: max-content;[\s\S]*?min-width: 100%/);
});

test('Stage 10A migration stores Battery Health as one-decimal fixed precision', () => {
  const sql = read('sql/2026-07-stage-10a-unit-export-foundation.sql');
  const applyScript = read('scripts/apply-stage-10a-unit-export-foundation.sh');
  const validator = read('scripts/validateStage10aUnitExportFoundation.js');

  assert.match(sql, /DECIMAL\(5,1\) UNSIGNED/);
  assert.match(sql, /DROP CHECK chk_units_battery_health_percent/);
  assert.match(sql, /BETWEEN 0\.0 AND 100\.0/);
  assert.match(applyScript, /decimal\(5,1\) unsigned/);
  assert.match(validator, /decimal\(5,1\) unsigned/);
});

test('Export preview renders every matching Unit instead of only the first five', () => {
  const controller = read('controllers/techController.js');
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');

  assert.match(controller, /previewRows: dataset\.rows,/);
  assert.doesNotMatch(controller, /dataset\.rows\.slice\(0,\s*5\)/);
  assert.match(modal, /<%= formatNumber\(safeDataset\.totalRows\) %> matching/);
  assert.match(modal, /class="unit-export-preview-table-title">Preview<\/h3>/);
  assert.doesNotMatch(modal, /First <%= Math\.min\(5,/);
});

