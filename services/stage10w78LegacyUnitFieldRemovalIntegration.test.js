'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const { getUnitFormFieldDefinition } = require('../config/unitFormFieldRegistry');
const { getLotRequirementField } = require('../config/lotRequirementRegistry');
const {
  CATEGORY_BINDINGS,
  VALUE_BINDINGS,
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS
} = require('../config/configIdentityRegistry');

test('retired legacy Unit fields are absent from current registries and config identities', () => {
  assert.equal(getUnitFormFieldDefinition('physical_camera_status'), null);
  assert.equal(getUnitFormFieldDefinition('hardware_notes'), null);
  assert.equal(getUnitFormFieldDefinition('cosmetic_notes'), null);
  assert.equal(getLotRequirementField('physical_camera_status'), null);
  assert.equal(Object.hasOwn(SYSTEM_CONFIG_CATEGORY_IDS, 'CAMERA_STATUSES'), false);
  assert.equal(Object.hasOwn(SYSTEM_CONFIG_VALUE_IDS, 'REQUIREMENT_PHYSICAL_CAMERA_STATUS'), false);
  assert.equal(CATEGORY_BINDINGS.some((entry) => entry.name === 'Camera Statuses'), false);
  assert.equal(VALUE_BINDINGS.some((entry) => entry.legacyCodes.includes('physical_camera_status')), false);
});

test('Add/Edit and duplicate flows no longer submit or preserve retired fields', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const duplicateModal = read('views/fragments/tech-unit-duplicate-modal.ejs');
  const controller = read('controllers/techController.js');

  for (const token of ['physicalCameraStatusConfigValueId', 'hardwareNotes', 'cosmeticNotes']) {
    assert.doesNotMatch(form, new RegExp(token));
    assert.doesNotMatch(duplicateModal, new RegExp(token));
    assert.doesNotMatch(controller, new RegExp(token));
  }
});

test('runtime models no longer query, persist, search, export, or audit retired fields', () => {
  const files = [
    'models/techUnitModel.js',
    'models/unitExpandedFormModel.js',
    'models/unitExpandedDetailModel.js',
    'models/lotValidationModel.js',
    'services/techLotRequirementWorkflow.js',
    'services/lotRequirementEvaluator.js',
    'services/unitAuditSnapshot.js'
  ];

  const retiredTokens = [
    'physical_camera_status',
    'physicalCameraStatus',
    'hardware_notes',
    'cosmetic_notes',
    'hardwareNotes',
    'cosmeticNotes'
  ];

  for (const file of files) {
    const source = read(file);
    for (const token of retiredTokens) {
      assert.doesNotMatch(source, new RegExp(token), `${file} still references ${token}`);
    }
  }

  const techUnitModel = read('models/techUnitModel.js');
  assert.match(techUnitModel, /searchParams\.push\(\.\.\.Array\(6\)\.fill\(likeSearch\)\)/);

  const exportService = read('services/unitExportService.js');
  assert.doesNotMatch(exportService, /unit\.hardwareNotes|unit\.cosmeticNotes/);
  assert.match(exportService, /hardwareRemarks: combineRemarks\(details \? details\.hardwareIssues : \[\]\)/);
  assert.match(exportService, /cosmeticRemarks: combineRemarks\(details \? details\.cosmeticIssues : \[\]\)/);
});

test('one-time migration removes retired schema columns and obsolete config identities', () => {
  const migration = read('scripts/migrateLegacyUnitFieldRemoval.js');
  for (const column of ['hardware_notes', 'cosmetic_notes', 'physical_camera_status_config_value_id']) {
    assert.match(migration, new RegExp(column));
    assert.match(migration, /DROP COLUMN/);
  }
  assert.match(migration, /RETIRED_CAMERA_CATEGORY_SYSTEM_ID = 9/);
  assert.match(migration, /RETIRED_PHYSICAL_CAMERA_REQUIREMENT_SYSTEM_ID = 320/);
  assert.match(migration, /DELETE FROM .*system_config_values/i);
  assert.match(migration, /DELETE FROM .*config_values/i);
  assert.match(migration, /dependent DB view/i);
});

test('old Specs/Tests migration no longer carries Physical Camera compatibility cleanup', () => {
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  assert.doesNotMatch(migration, /removeLegacyPhysicalCameraRules/);
  assert.doesNotMatch(migration, /REQUIREMENT_PHYSICAL_CAMERA_STATUS/);
  assert.doesNotMatch(migration, /physical_camera_status/);
});
