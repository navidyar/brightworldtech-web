'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REQUIREMENT_FIELD_BINDINGS } = require('../config/lotRequirementFormPolicy');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Unit form client highlights every canonical Lot Requirement field binding', () => {
  const client = read('public/js/tech-unit-form.js');
  const form = read('views/fragments/tech-unit-form.ejs');

  Object.entries(REQUIREMENT_FIELD_BINDINGS).forEach(([requirementKey, fieldKey]) => {
    assert.match(
      client,
      new RegExp(`${escapeRegExp(requirementKey)}:\\s*'${escapeRegExp(fieldKey)}'`),
      `Missing client Lot Requirement binding for ${requirementKey} -> ${fieldKey}`
    );
    assert.match(
      form,
      new RegExp(`data-unit-form-field-key="${escapeRegExp(fieldKey)}"`),
      `Missing Unit form wrapper for Lot Requirement field ${requirementKey} -> ${fieldKey}`
    );
  });

  assert.match(client, /const LOT_REQUIREMENT_FORM_FIELD_KEYS = new Set\(Object\.values\(LOT_REQUIREMENT_WRAPPER_KEYS\)\)/);
  assert.match(client, /control\.closest\('\[data-unit-form-field-key\]'\)/);
  assert.match(client, /LOT_REQUIREMENT_FORM_FIELD_KEYS\.has\(fieldKey\)/);
});

test('Unit form submission validation marks all local issues instead of stopping at the first one', () => {
  const client = read('public/js/tech-unit-form.js');

  assert.match(client, /function validateAllCapacityInputs[\s\S]*?let valid = true;[\s\S]*?inputs\.forEach[\s\S]*?valid = false;[\s\S]*?return valid;/);
  assert.match(client, /function validateAllRequiredRepeatableSections[\s\S]*?let valid = true;[\s\S]*?wrappers\.forEach[\s\S]*?valid = false;[\s\S]*?return valid;/);
  assert.match(client, /function validateTechUnitFormForSubmission[\s\S]*?let valid = true;[\s\S]*?validateAllCapacityInputs[\s\S]*?validateHardwareRowSelections[\s\S]*?validateAllRequiredRepeatableSections[\s\S]*?form\.checkValidity\(\)[\s\S]*?return valid;/);
  assert.match(client, /const localFormValid = validateTechUnitFormForSubmission\(form\);[\s\S]*?refreshLotRequirementWorkflow[\s\S]*?if \(!localFormValid\) \{\s*return false;/);
});

test('Unit form issue highlighting stays on controls instead of outlining field containers', () => {
  const featuresCss = read('public/css/features.css');
  const appCss = read('public/css/app.css');

  assert.doesNotMatch(featuresCss, /has-lot-requirement-error\s*\{[\s\S]*?outline-color/);
  assert.doesNotMatch(featuresCss, /has-lot-requirement-warning\s*\{[\s\S]*?outline-color/);
  assert.match(featuresCss, /has-lot-requirement-error :is\(input, select, textarea\)[\s\S]*?border-color:\s*#bf3e3e\s*!important;/);
  assert.match(featuresCss, /has-lot-requirement-error\s*\{[\s\S]*?--form-field-focus-border:\s*#bf3e3e;[\s\S]*?--form-field-focus-shadow:\s*0 0 0 3px rgb\(191 62 62 \/ 22%\);/);
  assert.match(featuresCss, /has-lot-requirement-warning\s*\{[\s\S]*?--form-field-focus-border:\s*#c78a27;[\s\S]*?--form-field-focus-shadow:\s*0 0 0 3px rgb\(199 138 39 \/ 22%\);/);
  assert.match(featuresCss, /has-lot-requirement-error input\[type="radio"\][\s\S]*?box-shadow:/);
  assert.doesNotMatch(featuresCss, /has-lot-requirement-error \.tech-outcome-options/);
  assert.doesNotMatch(appCss, /has-unit-form-validation-error \.tech-outcome-options/);
  assert.match(appCss, /\)\[aria-invalid="true"\]\s*\{[\s\S]*?border-color:\s*#c62828\s*!important;[\s\S]*?box-shadow:/);
});

test('Lot Requirement borders only appear for populated nonconforming values', () => {
  const client = read('public/js/tech-unit-form.js');
  const workflow = read('views/fragments/tech-unit-lot-requirement-workflow.ejs');

  assert.match(workflow, /data-requirement-actual-value-state="<%= check\.actualValueState \|\| 'unsupported' %>"/);
  assert.match(client, /actualValueState: issue\.getAttribute\('data-requirement-actual-value-state'\) \|\| ''/);
  assert.match(client, /if \(issue\.status !== 'rejected' \|\| issue\.actualValueState !== 'provided'\) \{\s*return;\s*\}/);
  assert.match(client, /wrapper\.classList\.add\(strictBlocked \? 'has-lot-requirement-error' : 'has-lot-requirement-warning'\)/);
});

test('committed Lot Requirement changes refresh immediately without losing priority', () => {
  const client = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');

  assert.match(client, /const immediate = Boolean\(options\.immediate \|\| form\._lotRequirementWorkflowRefreshImmediate\)/);
  assert.match(client, /if \(isLotRequirementWorkflowControl\(validationControl\)\) \{\s*scheduleLotRequirementWorkflowRefresh\(getFormFromElement\(validationControl\), \{ immediate: true \}\);/);
  assert.match(client, /function selectUnitModelOption[\s\S]*?scheduleLotRequirementWorkflowRefresh\(form, \{ immediate: true \}\);/);
  assert.match(client, /function selectProcessorOption[\s\S]*?scheduleLotRequirementWorkflowRefresh\(form, \{ immediate: true \}\);/);
  assert.match(controller, /const \[formOptions, issueFormOptions, expandedFormOptions\] = await Promise\.all\(\[/);
});

test('Unit Create and Update forms expose required markers for permanent and repeatable requirements', () => {
  const client = read('public/js/tech-unit-form.js');
  const form = read('views/fragments/tech-unit-form.ejs');

  assert.match(client, /wrapper\.querySelector\('\[data-unit-form-required-label\]'\)/);
  assert.match(client, /function updateRequiredAwareLabelText\(label, text\)[\s\S]*?const indicator = label\.querySelector\('\[data-unit-form-required-indicator\]'\)[\s\S]*?label\.appendChild\(indicator\)/);
  assert.match(client, /updateRequiredAwareLabelText\(biosSerialLabel,/);
  assert.match(client, /updateRequiredAwareLabelText\(osBuildLabel,/);
  assert.match(client, /updateRequiredAwareLabelText\(biosVersionLabel,/);
  assert.match(form, /Assignable Lot <span data-unit-form-required-indicator aria-hidden="true">\*<\/span>/);
  assert.match(form, /Unit Category <span data-unit-form-required-indicator aria-hidden="true">\*<\/span>/);
  assert.match(form, /data-unit-form-field-key="memory_modules"[\s\S]*?<strong data-unit-form-required-label>Current<\/strong>/);
  assert.match(form, /data-unit-form-field-key="storage_devices"[\s\S]*?<strong data-unit-form-required-label>Current<\/strong>/);
  ['Cameras', 'Batteries', 'Biometrics', 'Ports / Expansion'].forEach((label) => {
    assert.match(form, new RegExp(`<strong data-unit-form-required-label>${label.replace('/', '\\/')}<\\/strong>`));
  });
});
