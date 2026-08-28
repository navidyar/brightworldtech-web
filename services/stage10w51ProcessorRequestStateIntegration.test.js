'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const formJs = read('public/js/tech-unit-form.js');
const controller = read('controllers/catalogRequestController.js');
const modal = read('views/fragments/tech-unit-catalog-request-modal.ejs');

test('a selected compatible processor removes the processor-request action until the selection is cleared', () => {
  assert.match(formJs, /const hasSelectedCompatibleProcessor = Boolean\([\s\S]*?processorOptionSupportsUnitModel\(selectedProcessorOption, modelSelectionInput\.value\)[\s\S]*?\);/);
  assert.match(formJs, /const canRequestProcessor = hasSelectedUnitModel && !hasSelectedCompatibleProcessor;/);
  assert.match(formJs, /processorAction\.hidden = hasSelectedCompatibleProcessor;/);
  assert.match(formJs, /function selectProcessorOption\([\s\S]*?updateCatalogRequestControls\(form\);[\s\S]*?scheduleLotRequirementWorkflowRefresh/);
});

test('missing processor requests remain available when a model is selected but no compatible processor is selected', () => {
  assert.match(formJs, /const needsProcessorRequestEntry = canRequestProcessor && compatibleProcessorCount === 0;/);
  assert.match(formJs, /Use this only when the observed Processor is not available for the selected Unit Model\./);
  assert.match(formJs, /Enter the observed Processor Type, Processor, and Processor Speed above, then send the catalog request\./);
});

test('server-side duplicate protection distinguishes already-mapped processors from missing model associations', () => {
  assert.match(controller, /const alreadyMappedProcessor = globalProcessorMatches\.find\([\s\S]*?processor\.unitModelIds\.includes\(unitModelId\)/);
  assert.match(controller, /const existingGlobalMatch = alreadyMappedProcessor[\s\S]*?\? null[\s\S]*?globalProcessorMatches\.find\(\(processor\) => processor\.identityMatch\)/);
  assert.match(controller, /already associated with this Unit Model\. Close this request and select the existing processor\./);
  assert.match(modal, /Processor Already Available/);
  assert.match(modal, /safeErrors\.length === 0 && \(safeContext\.manufacturerName \|\| safeContext\.unitModelName\)/);
});

test('processor request state fix is cache-busted on every Tech Unit form surface', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=[^"\'\s>]+/);
  }
});

test('modified browser script keeps valid JavaScript syntax', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/js/tech-unit-form.js')], { stdio: 'pipe' });
});
