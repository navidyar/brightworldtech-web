'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit Category appears before Manufacturer in the Add/Edit form', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const categoryIndex = markup.indexOf('<span>Unit Category</span>');
  const manufacturerIndex = markup.indexOf('<span>Manufacturer</span>');

  assert.ok(categoryIndex > -1);
  assert.ok(manufacturerIndex > -1);
  assert.ok(categoryIndex < manufacturerIndex);
  assert.match(markup, /Unit Category, Manufacturer, and Model/);
});

test('regular Tech and QC roles do not receive visible Production Weight information', () => {
  const controller = read('controllers/techController.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const table = read('views/fragments/tech-units-table.ejs');
  const completeModal = read('views/fragments/tech-unit-complete-work-modal.ejs');

  assert.match(controller, /function userCanViewProductionWeight[\s\S]*?\['admin', 'management', 'tech_lead'\]/);
  assert.match(controller, /canViewProductionWeight: userCanViewProductionWeight\(req\)/);
  assert.match(controller, /redactProductionWeightFromTimeline/);
  assert.match(controller, /production weight\|production credit\|current lot weight/i);
  assert.match(form, /if \(isEditMode && canViewProductionWeight\)/);
  assert.match(form, /canViewProductionWeight \? lotProductionWeightValue : ''/);
  assert.match(form, /canViewProductionWeight \? \(category\.defaultProductionWeightValue/);
  assert.match(table, /canViewCurrentLotWeight = currentUserRoles\.some\(\(roleCode\) => \['admin', 'management', 'tech_lead'\]/);
  assert.match(table, /canViewTechWeightDetails = currentUserRoles\.some\(\(roleCode\) => \['admin', 'management', 'tech_lead'\]/);
  assert.match(completeModal, /showProductionWeight/);
  assert.match(completeModal, /Completed By/);
});

test('memory and storage sizes use text inputs with GB/TB parsing instead of number spinners', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const source = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');

  const sizeInputPatterns = [
    /type="text"[\s\S]{0,260}name="previousMemoryModules\[[^\]]+\]\[sizeGb\]"[\s\S]{0,260}data-capacity-input/,
    /type="text"[\s\S]{0,260}name="memoryModules\[[^\]]+\]\[sizeGb\]"[\s\S]{0,260}data-capacity-input/,
    /type="text"[\s\S]{0,260}name="previousStorageDevices\[[^\]]+\]\[sizeGb\]"[\s\S]{0,260}data-capacity-input/,
    /type="text"[\s\S]{0,260}name="storageDevices\[[^\]]+\]\[sizeGb\]"[\s\S]{0,260}data-capacity-input/
  ];

  sizeInputPatterns.forEach((pattern) => assert.match(markup, pattern));
  assert.doesNotMatch(markup, /type="number"[^>]+name="(?:previousMemoryModules|memoryModules|previousStorageDevices|storageDevices)\[[^\]]+\]\[sizeGb\]"/);

  assert.match(source, /function parseCapacityInputToGb/);
  assert.match(source, /function validateAllCapacityInputs/);
  assert.match(source, /amount % 1024 === 0/);
  assert.match(source, /amount % 1000 === 0/);
  assert.match(source, /if \(input\.disabled\) \{[\s\S]*?continue;/);
  assert.match(source, /formatCapacityGb\(previousMemoryTotal\)/);
  assert.match(source, /formatCapacityGb\(storageTotal\)/);
  assert.match(controller, /normalizeHardwareCapacityForStorage\(row\.sizeGb\)/);
  assert.match(controller, /parseHardwareCapacityToGb\(moduleRow\.sizeGb\)/);
  assert.match(controller, /parseHardwareCapacityToGb\(deviceRow\.sizeGb\)/);
  assert.match(markup, /Enter 0 for an empty (?:slot|bay)/);
});

test('browser, history, audit, requirements, and exports format terabyte capacities consistently', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const history = read('services/unitHistoryTimeline.js');
  const audit = read('services/unitAuditSnapshot.js');
  const evaluator = read('services/lotRequirementEvaluator.js');
  const workflow = read('services/techLotRequirementWorkflow.js');
  const exportService = read('services/unitExportService.js');

  assert.match(table, /numeric % 1024 === 0/);
  assert.match(history, /formatHardwareCapacityGb/);
  assert.match(audit, /formatHardwareCapacityGb/);
  assert.match(evaluator, /formatter: formatHardwareCapacityGb/);
  assert.match(workflow, /formatter: formatHardwareCapacityGb/);
  assert.match(exportService, /formatHardwareCapacityGb/);
});
