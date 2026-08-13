'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const formJs = read('public/js/tech-unit-form.js');

test('Create/Edit Unit uses one capture-phase save preflight instead of chained submit replays', () => {
  const submitListenerCount = (formJs.match(/document\.addEventListener\('submit', \(event\) => \{/g) || []).length;

  assert.equal(submitListenerCount, 1);
  assert.match(formJs, /async function runTechUnitSubmitPreflight\(form, selectedLotId\)/);
  assert.match(formJs, /runTechUnitSubmitPreflight\(form, selectedLotId\)[\s\S]*?validateTechUnitFormForSubmission\(form\)[\s\S]*?replayTechUnitFormSubmit\(form, submitter\)/);
  assert.doesNotMatch(formJs, /duplicateSubmitReplay|lotProfileSubmitRefreshPending|lotRequirementWorkflowSubmitPending/);
});

test('a valid selected Lot ID remains authoritative even if visible combobox text drifts', () => {
  assert.match(
    formJs,
    /function ensureAssignableLotSelectionForSubmit\(form, reportValidity\)[\s\S]*?if \(selectedOption\) \{[\s\S]*?comboboxInput\.value = getAssignableLotOptionLabel\(selectedOption\);[\s\S]*?return true;/
  );
  assert.match(formJs, /if \(comboboxInput\.value\.trim\(\) && resolveExactAssignableLotMatch\(form\)\)/);
  assert.match(formJs, /setAssignableLotInputValidity\(form, 'Choose an assignable lot from the list\.'\)/);
});

test('browser constraint validation waits until the authoritative Lot profile has settled', () => {
  assert.match(formJs, /form\.noValidate = true;/);
  assert.match(
    formJs,
    /refreshLotUnitFormProfile\(form, \{ background: true, force: true \}\)[\s\S]*?validateAllCapacityInputs\(form, true\)[\s\S]*?refreshLotRequirementWorkflow\(form, \{ background: true \}\)/
  );
  assert.match(formJs, /function validateTechUnitFormForSubmission\(form\)[\s\S]*?if \(!form\.checkValidity\(\)\)/);
  assert.match(formJs, /if \(form\.dataset\.techUnitSubmitPreflightPending === 'true'\) \{[\s\S]*?return;/);
});

test('the one-click save fix is cache-busted on every Tech Unit form entry surface', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=20260813-stage10w50-unit-save-preflight/);
  }
});
