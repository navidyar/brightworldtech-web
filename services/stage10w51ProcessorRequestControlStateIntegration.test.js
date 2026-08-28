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

test('selecting a managed Unit Model immediately refreshes catalog-request controls', () => {
  const script = read('public/js/tech-unit-form.js');
  const body = functionBody(script, 'selectUnitModelOption', 'resolveExactUnitModelMatch');
  const applyIndex = body.indexOf('applySelectedModelMetadata(form);');
  const requestControlIndex = body.indexOf('updateCatalogRequestControls(form);');

  assert.notEqual(applyIndex, -1);
  assert.notEqual(requestControlIndex, -1);
  assert.ok(requestControlIndex > applyIndex, 'request controls must refresh after Processor compatibility is recalculated');
});

test('managed model selection disables missing-model requests and enables Processor requests', () => {
  const script = read('public/js/tech-unit-form.js');
  const body = functionBody(script, 'updateCatalogRequestControls', 'setUnitModelInputValidity');

  assert.match(body, /const hasSelectedModel = Boolean\(modelSelectionInput && modelSelectionInput\.value\)/);
  assert.match(body, /&& !hasSelectedModel/);
  assert.match(body, /const hasSelectedCompatibleProcessor = Boolean\(/);
  assert.match(body, /const canRequestProcessor = hasSelectedUnitModel && !hasSelectedCompatibleProcessor/);
  assert.match(body, /setCatalogRequestButtonState\(processorButton, canRequestProcessor\)/);
});

test('a selected model with no compatible Processor reveals the missing-processor message', () => {
  const script = read('public/js/tech-unit-form.js');
  const template = read('views/fragments/tech-unit-form.ejs');
  const body = functionBody(script, 'updateCatalogRequestControls', 'setUnitModelInputValidity');

  assert.match(template, /data-processor-catalog-empty-message hidden/);
  assert.match(template, /No compatible processors are cataloged for this Unit Model/);
  assert.match(body, /processorEmptyMessage\.hidden = !needsProcessorRequestEntry/);
  assert.match(body, /Enter the observed Processor Type, Processor, and Processor Speed above/);
});

test('Processor request details are enterable before opening the request modal', () => {
  const template = read('views/fragments/tech-unit-form.ejs');
  const modal = read('views/fragments/tech-unit-catalog-request-modal.ejs');

  assert.match(template, /data-processor-request-type-input/);
  assert.match(template, /data-processor-request-name-input/);
  assert.match(template, /data-processor-request-speed-input/);
  assert.match(modal, /name="requestedProcessorType"/);
  assert.match(modal, /name="requestedProcessorName"/);
  assert.match(modal, /name="requestedProcessorSpeedGhz"/);
  assert.match(modal, /name="requesterNote"/);
});

test('all Unit form entry points use the Stage 10W.5.2 cache version', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=[^"\'\s>]+/);
  }
});
