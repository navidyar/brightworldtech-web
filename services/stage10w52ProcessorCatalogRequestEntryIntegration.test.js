'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function functionBody(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}(`);
  const end = source.indexOf(`function ${nextFunctionName}(`, start + 1);

  assert.notEqual(start, -1, `${functionName} must exist`);
  assert.notEqual(end, -1, `${nextFunctionName} must follow ${functionName}`);
  return source.slice(start, end);
}


function buildCatalogControlHarness({ selectedModelId = '', typedModelName = '', compatibleProcessors = 0 } = {}) {
  const controls = {
    manufacturer: { value: '3' },
    category: { value: '5' },
    modelSelection: { value: selectedModelId },
    modelInput: { value: typedModelName },
    modelButton: { disabled: true, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
    modelHint: { textContent: '' },
    processorButton: { disabled: true, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
    processorHint: { textContent: '' },
    processorMessage: { hidden: true },
    processorFields: { hidden: true },
    processorRequestSpeed: { value: '' },
    unitProcessorSpeed: { value: '2.40' }
  };
  const selectorMap = new Map([
    ['[data-manufacturer-select]', controls.manufacturer],
    ['[data-unit-category-select]', controls.category],
    ['[data-catalog-request-button="model"]', controls.modelButton],
    ['[data-catalog-request-model-hint]', controls.modelHint],
    ['[data-catalog-request-button="processor"]', controls.processorButton],
    ['[data-catalog-request-processor-hint]', controls.processorHint],
    ['[data-processor-catalog-empty-message]', controls.processorMessage],
    ['[data-processor-catalog-request-fields]', controls.processorFields],
    ['[data-processor-request-speed-input]', controls.processorRequestSpeed],
    ['[data-processor-speed-input]', controls.unitProcessorSpeed]
  ]);
  const form = { querySelector(selector) { return selectorMap.get(selector) || null; } };
  const source = read('public/js/tech-unit-form.js');
  const body = functionBody(source, 'updateCatalogRequestControls', 'setUnitModelInputValidity');
  const updateControls = new Function(
    'getUnitModelSelectionInput',
    'getUnitModelComboboxInput',
    'getVisibleProcessorOptions',
    'setCatalogRequestButtonState',
    `${body}; return updateCatalogRequestControls;`
  )(
    () => controls.modelSelection,
    () => controls.modelInput,
    () => Array.from({ length: compatibleProcessors }, (_, index) => ({ value: String(index + 1) })),
    (button, enabled) => {
      if (!button) return;
      button.disabled = !enabled;
      button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }
  );

  return { controls, form, updateControls };
}

test('model requests remain available from both Add and Edit Unit', () => {
  const template = read('views/fragments/tech-unit-form.ejs');
  const controller = read('controllers/catalogRequestController.js');

  assert.match(template, /const canRequestModelCatalogException = Boolean\(formOptions\.canRequestCatalogException\)/);
  assert.doesNotMatch(template, /canRequestModelCatalogException = !isEditMode/);
  assert.match(template, /data-catalog-request-action-kind="model"/);
  assert.match(template, />Request Missing Model</);
  assert.match(controller, /Catalog Exception requests from Add\/Edit Unit/);
});

test('catalog-request actions are not hidden by Lot field visibility followers', () => {
  const template = read('views/fragments/tech-unit-form.ejs');
  const modelAction = template.match(/<div class="tech-catalog-request-action" data-catalog-request-action-kind="model">[\s\S]*?<\/div>/)?.[0] || '';
  const processorAction = template.match(/<div class="tech-catalog-request-action" data-catalog-request-action-kind="processor">[\s\S]*?<\/div>/)?.[0] || '';

  assert.ok(modelAction);
  assert.ok(processorAction);
  assert.doesNotMatch(modelAction, /data-unit-form-follows-key/);
  assert.doesNotMatch(processorAction, /data-unit-form-follows-key/);
});

test('a model with zero compatible processors exposes request-only type, name, and speed fields', () => {
  const template = read('views/fragments/tech-unit-form.ejs');
  const script = read('public/js/tech-unit-form.js');
  const body = functionBody(script, 'updateCatalogRequestControls', 'setUnitModelInputValidity');

  assert.match(template, /data-processor-catalog-request-fields hidden/);
  assert.match(template, /data-processor-request-type-input/);
  assert.match(template, /data-processor-request-name-input/);
  assert.match(template, /data-processor-request-speed-input/);
  assert.match(template, /These values are used only to prepare the catalog request/);
  assert.match(body, /const needsProcessorRequestEntry = canRequestProcessor && compatibleProcessorCount === 0/);
  assert.match(body, /processorRequestFields\.hidden = !needsProcessorRequestEntry/);
  assert.match(body, /setCatalogRequestButtonState\(processorButton, canRequestProcessor\)/);
});

test('Processor request modal is prefilled from request-only entry fields before catalog selectors', () => {
  const script = read('public/js/tech-unit-form.js');
  const body = functionBody(script, 'openCatalogRequestModal', 'openDuplicateAssumeModal');

  assert.match(body, /data-processor-request-type-input/);
  assert.match(body, /data-processor-request-name-input/);
  assert.match(body, /data-processor-request-speed-input/);
  assert.match(body, /params\.set\('requestedProcessorType', requestedType\)/);
  assert.match(body, /params\.set\('requestedProcessorName', requestedName\)/);
  assert.match(body, /params\.set\('requestedProcessorSpeedGhz', requestedSpeed\)/);
});



test('zero compatible processors enable the request button and reveal all request-entry fields', () => {
  const { controls, form, updateControls } = buildCatalogControlHarness({
    selectedModelId: '42',
    typedModelName: 'Managed Model',
    compatibleProcessors: 0
  });

  updateControls(form);

  assert.equal(controls.processorButton.disabled, false);
  assert.equal(controls.processorButton.attributes['aria-disabled'], 'false');
  assert.equal(controls.processorMessage.hidden, false);
  assert.equal(controls.processorFields.hidden, false);
  assert.equal(controls.processorRequestSpeed.value, '2.40');
  assert.match(controls.processorHint.textContent, /Enter the observed Processor Type/);
});

test('typing an unknown model enables Request Missing Model in Edit-capable markup', () => {
  const { controls, form, updateControls } = buildCatalogControlHarness({
    selectedModelId: '',
    typedModelName: 'Unlisted Model 9000',
    compatibleProcessors: 0
  });

  updateControls(form);

  assert.equal(controls.modelButton.disabled, false);
  assert.equal(controls.modelButton.attributes['aria-disabled'], 'false');
  assert.match(controls.modelHint.textContent, /controlled review/);
});


test('all Unit form entry points use the current scanner-safe form asset version', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=20260806-stage10w10-serial-scanner-enter-guard/);
  }
});
