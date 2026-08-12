'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  listLotRequirementFields
} = require('../config/lotRequirementRegistry');
const {
  listLotConfigurableUnitFormFields
} = require('../config/unitFormFieldRegistry');
const {
  normalizeCosmeticGradeRequirementOptions
} = require('./cosmeticGradeNormalization');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Configure Unit Form covers every live independently configurable field and the real Previous sections', () => {
  const registry = listLotConfigurableUnitFormFields();
  const form = read('views/fragments/tech-unit-form.ejs');
  const modal = read('views/fragments/lot-unit-form-rules-modal.ejs');

  assert.equal(registry.length, 29);

  for (const field of registry) {
    assert.equal(field.visibilityConfigurable, true, `${field.key} visibility`);
    assert.equal(field.requirementConfigurable, true, `${field.key} requirement`);
    assert.match(form, new RegExp(`data-unit-form-field-key=["']${field.key}["']`));
  }

  assert.match(form, /data-unit-form-companion-key="previous_memory_size"/);
  assert.match(form, /data-unit-form-field-key="previous_memory_size"[^>]*aria-label="Previous memory modules"/);
  assert.match(form, /data-unit-form-companion-key="previous_storage_size"/);
  assert.match(form, /data-unit-form-field-key="previous_storage_size"[^>]*aria-label="Previous storage devices"/);
  assert.match(modal, /System-managed, derived, and permission-gated controls remain protected/);
});

test('requirements cover operational form values and numeric fields expose equals/minimum/maximum', () => {
  const definitions = new Map(listLotRequirementFields().map((field) => [field.key, field]));
  const expected = [
    'unit_type', 'manufacturer', 'model',
    'processor', 'processor_family', 'processor_speed_ghz', 'ram_gb', 'ram_type',
    'memory_install_type', 'storage_gb', 'storage_type', 'storage_wipe_status',
    'operating_system', 'os_build', 'bios_version', 'battery_health', 'absolute_status',
    'physical_camera_status', 'touchscreen_status', 'keyboard_language', 'complete_diagnostics',
    'virus_check', 'driver_check', 'skinned_status', 'overall_grade', 'unit_outcome'
  ];

  assert.deepEqual([...definitions.keys()], expected);
  assert.equal(definitions.has('unit_serial_number'), false);
  assert.equal(definitions.has('bios_serial_number'), false);

  for (const key of ['processor_speed_ghz', 'ram_gb', 'storage_gb', 'battery_health']) {
    assert.deepEqual(definitions.get(key).allowedOperators, ['equals', 'greater_equal', 'less_equal']);
  }
});

test('Cosmetic Grade requirement options collapse legacy wording into canonical letters', () => {
  const normalized = normalizeCosmeticGradeRequirementOptions([
    { value: 'config_value:10', label: 'Grade A', code: 'grade_a', source: 'unit_grades' },
    { value: 'config_value:20', label: 'A', code: 'a', source: 'cosmetic_grades' },
    { value: 'config_value:30', label: 'Cosmetic Grade AB', code: 'cosmetic_grade_ab', source: 'unit_grades' },
    { value: 'config_value:35', label: 'AB', code: 'ab', source: 'cosmetic_grades' },
    { value: 'config_value:40', label: 'Grade B', code: 'grade_b', source: 'overall_unit_grades' },
    { value: 'config_value:45', label: 'B', code: 'b', source: 'cosmetic_grades' },
    { value: 'config_value:50', label: 'Not Yet Graded', code: 'not_yet_graded', source: 'cosmetic_grades' }
  ]);

  assert.deepEqual(normalized.map((option) => option.label), ['A', 'AB', 'B']);
  assert.deepEqual(normalized.map((option) => option.value), ['config_value:20', 'config_value:35', 'config_value:45']);
});

test('requirement UI supports searchable catalogs, exact text, and numeric range values', () => {
  const optionsModel = read('models/requirementOptionModel.js');
  const browser = read('public/js/lot-requirements.js');
  const modal = read('views/fragments/lot-requirement-form-modal.ejs');
  const detailPage = read('views/pages/management-lot-detail.ejs');

  for (const source of [
    'storage_wipe_status', 'operating_system', 'absolute_status', 'physical_camera_status',
    'touchscreen_status', 'keyboard_language', 'complete_diagnostics', 'virus_check',
    'driver_check', 'skinned_status', 'overall_grade'
  ]) {
    assert.match(optionsModel, new RegExp(`${source}:`));
  }

  assert.match(optionsModel, /memory_install_type/);
  assert.match(optionsModel, /unit_outcome/);
  assert.match(optionsModel, /definition\.storageKind === 'text'/);
  assert.match(browser, /optionSet\.type === 'text'/);
  assert.match(browser, /Must Equal, Minimum, and Maximum/);
  assert.match(modal, /data-required-value-text/);
  assert.match(detailPage, /lot-requirements\.js\?v=20260807-stage10w17-expanded-requirements/);
});

test('child Lot validation and requirement-aware form profiles consume direct-parent effective requirements', () => {
  const lotModel = read('models/lotModel.js');
  const profileModel = read('models/lotUnitFormProfileModel.js');
  const validationModel = read('models/lotValidationModel.js');
  const techRequirementModel = read('models/techLotRequirementModel.js');
  const inheritance = read('services/lotRequirementInheritance.js');
  const policy = read('config/lotRequirementFormPolicy.js');

  assert.match(lotModel, /async function listEffectiveLotRequirements\(lotId\)/);
  assert.match(lotModel, /const parentLotId = Number\(selectedLot\.parent_lot_id\)/);
  assert.match(lotModel, /buildEffectiveLotRequirements\(/);
  assert.match(inheritance, /source_lot_id/);
  assert.match(inheritance, /source_lot_name/);
  assert.match(inheritance, /is_inherited/);
  assert.match(inheritance, /inheritance_depth/);
  assert.match(profileModel, /lotModel\.listEffectiveLotRequirements\(normalizedLotId\)/);
  assert.match(validationModel, /lotModel\.listEffectiveLotRequirements\(lotId\)/);
  assert.match(techRequirementModel, /lotModel\.listEffectiveLotRequirements\(safeLotId\)/);
  assert.match(policy, /inherited from/);
});

test('Requirements modal distinguishes inherited rows and lets child Lots customize a parent field', () => {
  const modal = read('views/fragments/lot-requirements-modal.ejs');
  const controller = read('controllers/lotController.js');

  assert.match(modal, /Inherited from <%= requirement\.source_lot_name/);
  assert.match(modal, /Number\(requirement\.is_inherited\) !== 1/);
  assert.match(modal, />Customize</);
  assert.match(modal, />View Parent</);
  assert.match(controller, /lotModel\.listEffectiveLotRequirements\(lotId\)/);
});

test('registry-backed migration can audit before applying new requirement types', () => {
  const script = read('scripts/migrateLotRequirementCoverage.js');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(script, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(script, /listLotRequirementFields\(\)/);
  assert.match(script, /No database changes were made/);
  assert.match(script, /beginTransaction\(\)/);
  assert.equal(packageJson.scripts['audit:lot-requirement-coverage'], 'node scripts/migrateLotRequirementCoverage.js');
  assert.equal(packageJson.scripts['migrate:lot-requirement-coverage'], 'node scripts/migrateLotRequirementCoverage.js --apply');
});
