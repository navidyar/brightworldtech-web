'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUnitFormFieldDefinition,
  listLotConfigurableUnitFormFields
} = require('../config/unitFormFieldRegistry');
const { UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');
const { saveSpecsTestsForUnitWithConnection } = require('../models/unitSpecsTestsModel');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Specs and Tests replace the old combined system section', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(form, /tech-form-section--specifications/);
  assert.match(form, /tech-form-section--tests/);
  assert.doesNotMatch(form, /Operating System, BIOS, and Status Fields/);
  assert.doesNotMatch(form, /name="physicalCameraStatusConfigValueId"/);
});

test('new selectable controls use Choose an option and do not encode a true default', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  for (const name of [
    'wifiCardPresentConfigValueId', 'chargerIncludedConfigValueId', 'displayTypeConfigValueId',
    'nativeScreenResolutionConfigValueId', 'refreshRateConfigValueId', 'keyboardTestResultConfigValueId',
    'microphoneCheckResultConfigValueId', 'audioOutputCheckResultConfigValueId', 'allScrewsPresentConfigValueId',
    'biosLockConfigValueId', 'mdmLockConfigValueId'
  ]) {
    assert.match(form, new RegExp(`name="${name}"[\\s\\S]*?<option value="">Choose an option<\\/option>`));
  }
});

test('repeatable cameras, batteries, biometrics, and ports use compact Add rows with limits', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(form, /data-unit-form-repeatable-type="camera" data-module-max="3"/);
  assert.match(form, /data-unit-form-repeatable-type="battery" data-module-max="2"/);
  assert.match(form, /data-unit-form-repeatable-type="biometric" data-module-max="6"/);
  assert.match(form, /data-unit-form-repeatable-type="port" data-module-max="30"/);
  const script = read('public/js/tech-unit-form.js');
  assert.match(script, /updateRepeatableAddButtonState/);
  assert.match(script, /refreshLotUnitFormProfile\(form,\s*\{\s*background: true,\s*force: true,\s*applyEvenIfUnchanged: true\s*\}\)/);
});

test('all newly introduced fields participate in Lot visible-hidden and required-optional configuration', () => {
  const keys = new Set(listLotConfigurableUnitFormFields().map((field) => field.key));
  for (const key of [
    'wifi_card_present', 'charger_included', 'display_type', 'native_screen_resolution', 'refresh_rate', 'color',
    'apple_model_number', 'cameras', 'camera_type', 'camera_location', 'camera_test', 'batteries', 'battery_health',
    'battery_cycle_count', 'biometrics', 'biometric_hardware', 'biometrics_test', 'ports', 'port_type', 'port_count',
    'keyboard_test', 'microphone_check', 'audio_output_check', 'all_screws_present', 'bios_lock', 'efi_lock',
    'mdm_lock', 'icloud_activation_lock', 'ce_certification', 'open_box_status', 'box_language'
  ]) {
    assert.equal(keys.has(key), true, `${key} should be configurable by Lot.`);
    const field = getUnitFormFieldDefinition(key);
    assert.equal(field.visibilityConfigurable, true);
    assert.equal(field.requirementConfigurable, true);
  }
});

test('Apple applicability keeps Firmware, Touchscreen, Diagnostics, Threat Protection, and MDM while hiding PC-only fields', () => {
  const script = read('public/js/tech-unit-form.js');
  assert.match(script, /Recovery Number/);
  assert.match(script, /OS Version/);
  assert.match(script, /Firmware Version/);
  assert.match(script, /isAppleSiliconProcessorSelected/);
  assert.deepEqual(getUnitFormFieldDefinition('efi_lock').applicableManufacturers, ['Apple']);
  assert.deepEqual(getUnitFormFieldDefinition('icloud_activation_lock').applicableManufacturers, ['Apple']);
  assert.deepEqual(getUnitFormFieldDefinition('battery_cycle_count').applicableManufacturers, ['Apple']);
  assert.equal(getUnitFormFieldDefinition('mdm_lock').applicableManufacturers, null);
  for (const key of ['wifi_card_present', 'native_screen_resolution', 'refresh_rate', 'driver_check', 'absolute_status', 'bios_lock']) {
    assert.deepEqual(getUnitFormFieldDefinition(key).excludedManufacturers, ['Apple'], `${key} should be unavailable for Apple.`);
  }
  for (const key of ['bios_version', 'touchscreen_status', 'complete_diagnostics', 'virus_check']) {
    assert.equal(getUnitFormFieldDefinition(key).excludedManufacturers, null, `${key} should remain available for Apple.`);
  }
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(form, /data-unit-form-field-key="battery_cycle_count" data-apple-only-field/);
  assert.match(form, /data-unit-form-field-key="wifi_card_present" data-not-apple-field/);
  assert.match(form, /data-unit-form-field-key="bios_version">[\s\S]*?data-bios-version-label/);
  assert.match(form, /data-unit-form-field-key="touchscreen_status"><span>Touchscreen Test/);
  assert.match(form, /data-unit-form-field-key="complete_diagnostics"><span>Diagnostics Test/);
  assert.match(form, /data-unit-form-field-key="virus_check"><span>Threat Protection Scan/);
  const detail = read('views/fragments/tech-units-table.ejs');
  const exportService = read('services/unitExportService.js');
  assert.match(detail, /isAppleUnit[\s\S]*?Firmware Version[\s\S]*?OS Version/);
  assert.match(exportService, /const isApple = [\s\S]*?row\.cycleCount/);
});

test('Threat Protection Scan replaces Virus Check wording while preserving the existing stored field', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  assert.match(form, /Threat Protection Scan/);
  assert.match(form, /name="virusCheckStatusConfigValueId"/);
  assert.match(migration, /Threat Protection Scan Results/);
});

test('migration creates ID-bound configurable option categories and repeatable hardware tables', () => {
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  for (const text of ['Yes / No Options', 'Test Results', 'Lock Statuses', 'Display Types', 'Screen Resolutions', 'Refresh Rates', 'Camera Types', 'Camera Locations', 'Biometric Hardware', 'Ports / Expansion Types', 'Box Languages']) {
    assert.match(migration, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const color of ['Black', 'Silver', 'Gray', 'White', 'Blue', 'Red', 'Gold', 'Rose Gold']) {
    assert.match(migration, new RegExp(`\\['${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', false\\]`));
  }
  for (const color of ['Space Gray', 'Space Black', 'Midnight', 'Starlight', 'Sky Blue', 'Green', 'Pink', 'Yellow', 'Orange', 'Purple']) {
    assert.match(migration, new RegExp(`\\['${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', false\\]`));
  }
  for (const table of ['unit_cameras', 'unit_batteries', 'unit_biometrics', 'unit_ports']) {
    assert.match(migration, new RegExp(table));
  }
});

test('legacy Physical Camera Lot rules are retired during migration', () => {
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  assert.match(migration, /removeLegacyPhysicalCameraRules/);
  assert.match(migration, /physical_camera_status/);
  assert.equal(require('../config/lotRequirementRegistry').getLotRequirementField('physical_camera_status').selectable, false);
});

test('new fields are available in export column selection', () => {
  const keys = new Set(UNIT_EXPORT_COLUMNS.map((column) => column.key));
  for (const key of [
    'appleModelNumber', 'nativeScreenResolution', 'refreshRate', 'cameras', 'batteries', 'biometrics',
    'portsExpansion', 'microphoneCheck', 'audioOutputCheck', 'threatProtectionScan', 'mdmLock',
    'processorSpeedGhz', 'skinnedStatus', 'gradeNotes', 'outcomeNotes', 'generalComment'
  ]) {
    assert.equal(keys.has(key), true, `${key} should be exportable.`);
  }
});

test('history snapshot includes new simple and repeatable data with configurable labels', () => {
  const audit = read('services/unitAuditSnapshot.js');
  assert.match(audit, /Threat Protection Scan/);
  assert.match(audit, /formatCameraRows/);
  assert.match(audit, /formatBatteryRows/);
  assert.match(audit, /formatBiometricRows/);
  assert.match(audit, /formatPortRows/);
});

test('Tech edits preserve unchanged tool provenance and update repeatable rows by stable row ID', () => {
  const model = read('models/unitSpecsTestsModel.js');
  assert.match(model, /const fields = candidateFields\.filter\(\(field\) => \{/);
  assert.match(model, /if \(fields\.length === 0\) return;/);
  assert.match(model, /const existingById = new Map\(existingRows\.map/);
  assert.match(model, /const requestedId = normalizePositiveInteger\(row\.rowId\);/);
  assert.match(model, /if \(dataChanged\) \{/);
  assert.match(model, /source_code = 'tech_edit'/);
  assert.match(model, /else if \(orderChanged\)/);
  assert.doesNotMatch(model, /DELETE FROM `\$\{tableName\}` WHERE unit_id = \?[^\n]*\n[^\n]*INSERT INTO/);
});


test('new repeatable rows are renumbered with their real collection names and receive current Lot/applicability rules', () => {
  const script = read('public/js/tech-unit-form.js');
  assert.match(script, /if \(rowType === 'camera'\) \{\s*return 'cameras';/);
  assert.match(script, /if \(rowType === 'battery'\) \{\s*return 'batteries';/);
  assert.match(script, /if \(rowType === 'biometric'\) \{\s*return 'biometrics';/);
  assert.match(script, /if \(rowType === 'port'\) \{\s*return 'ports';/);
  assert.match(script, /applyEvenIfUnchanged/);
  assert.match(script, /applyManufacturerFieldApplicability\(form\);\s*refreshLotUnitFormProfile\(form, \{\s*background: true,\s*force: true,\s*applyEvenIfUnchanged: true/);
});

test('one-click save preflight cannot be aborted by a queued background Lot requirement refresh', () => {
  const script = read('public/js/tech-unit-form.js');
  assert.match(script, /function cancelScheduledLotRequirementWorkflowRefresh\(form\)/);
  assert.match(script, /if \(form\.dataset\.techUnitSubmitPreflightPending === 'true'\) \{\s*return;\s*\}/);
  assert.match(script, /form\.dataset\.techUnitSubmitPreflightPending = 'true';\s*cancelScheduledLotRequirementWorkflowRefresh\(form\);/);
  assert.match(script, /if \(!hasCurrentLotRequirementSubmitVerification\(form, selectedLotId\)\) \{\s*cancelScheduledLotRequirementWorkflowRefresh\(form\);\s*const requirementResult/);
});

test('an Edit submission updates an existing legacy-migrated battery row instead of losing the battery', async () => {
  const state = {
    battery: {
      unit_battery_id: 7,
      health_percent: '82.0',
      cycle_count: null,
      sort_order: 10
    },
    summaryHealth: '82.0',
    batteryUpdateCount: 0
  };

  const connection = {
    async query(sql, params = []) {
      const text = String(sql);

      if (text.includes('information_schema.TABLES')) {
        const tableName = String(params[0] || '');
        return [[...(tableName === 'unit_batteries' ? [{ present: 1 }] : [])]];
      }

      if (text.includes('information_schema.COLUMNS')) {
        const tableName = String(params[0] || '');
        return [[...(tableName === 'units' ? [{ column_name: 'battery_health_percent' }] : [])]];
      }

      if (text.includes('SELECT `unit_battery_id`') && text.includes('FROM `unit_batteries`')) {
        return [[{ ...state.battery }]];
      }

      if (text.startsWith('UPDATE `unit_batteries` SET')) {
        state.battery.health_percent = String(params[0]);
        state.battery.cycle_count = params[1];
        state.battery.sort_order = Number(params[2]);
        state.batteryUpdateCount += 1;
        return [{ affectedRows: 1 }];
      }

      if (text.startsWith('UPDATE units SET battery_health_percent')) {
        state.summaryHealth = params[0] === null ? null : String(params[0]);
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected SQL in battery persistence regression test: ${text}`);
    }
  };

  await saveSpecsTestsForUnitWithConnection(connection, {
    unitId: 101,
    currentUserId: 5,
    formData: {
      batteries: [{ rowId: '7', healthPercent: '91.5', cycleCount: '' }]
    }
  });

  assert.equal(state.batteryUpdateCount, 1);
  assert.equal(state.battery.health_percent, '91.5');
  assert.equal(state.battery.cycle_count, null);
  assert.equal(state.summaryHealth, '91.5');
});

test('repeatable Specs rows stay compact and show a recorded state when all child controls are hidden', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const script = read('public/js/tech-unit-form.js');
  const css = read('public/css/tech-units-clean.css');

  assert.match(form, /data-repeatable-recorded-state hidden>Battery recorded</);
  assert.match(form, /data-repeatable-recorded-state hidden>Camera recorded</);
  assert.match(form, /data-repeatable-recorded-state hidden>Biometric hardware recorded</);
  assert.match(form, /data-repeatable-recorded-state hidden>Port entry recorded</);
  assert.match(script, /function updateRepeatableRecordedStates\(form\)/);
  assert.match(script, /function primeRepeatableRowFromCurrentProfile\(form, row\)/);
  assert.match(script, /primeRepeatableRowFromCurrentProfile\(form, row\);\s*list\.appendChild\(row\);/);
  assert.match(css, /tech-spec-repeatable-row--battery[\s\S]*?grid-template-columns: 22px minmax\(100px, 130px\) minmax\(90px, 120px\) max-content;/);
  assert.match(css, /tech-spec-repeatable-row--port[\s\S]*?grid-template-columns: 22px minmax\(180px, 260px\) 72px max-content;/);
  assert.match(css, /data-remove-module-row[\s\S]*?width: fit-content;/);
  assert.match(css, /tech-spec-short-field--year[\s\S]*?max-width: 118px;/);
});

test('removing the last compact Specs repeatable row returns the section to its initial Add-only state', () => {
  const script = read('public/js/tech-unit-form.js');
  assert.match(script, /COLLAPSIBLE_EMPTY_REPEATABLE_ROW_TYPES = new Set\(\['camera', 'battery', 'biometric', 'port'\]\)/);
  assert.match(script, /if \(rows\.length <= 1 && !COLLAPSIBLE_EMPTY_REPEATABLE_ROW_TYPES\.has\(rowType\)\)/);
  assert.match(script, /else \{\s*row\.remove\(\);\s*\}/);
});
