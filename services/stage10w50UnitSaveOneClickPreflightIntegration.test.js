'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const formJs = read('public/js/tech-unit-form.js');

function isolateFunction(signature, context) {
  const start = formJs.indexOf(`  ${signature}`);
  assert.ok(start >= 0, `${signature} exists`);
  const end = formJs.indexOf('\n  function ', start + 2);
  assert.ok(end > start, `${signature} has a following function`);
  return vm.runInNewContext(`${formJs.slice(start, end)}\n${signature.match(/function (\w+)/)[1]}`, context);
}

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

test('one-click save validates the refreshed profile and still checks Lot requirements when local fields fail', async () => {
  assert.match(formJs, /form\.noValidate = true;/);
  const calls = [];
  let finishProfile;
  const profilePending = new Promise((resolve) => { finishProfile = resolve; });
  const form = {
    dataset: {},
    querySelector: () => null
  };
  const runPreflight = isolateFunction('async function runTechUnitSubmitPreflight', {
    hasCurrentLotProfileSubmitVerification: () => false,
    refreshLotUnitFormProfile: async () => { calls.push('profile-start'); return profilePending; },
    getAssignableLotCatalog: () => ({ value: '42' }),
    validateTechUnitFormForSubmission: () => { calls.push('local-validation'); return false; },
    hasCurrentLotRequirementSubmitVerification: () => false,
    cancelScheduledLotRequirementWorkflowRefresh: () => {},
    refreshLotRequirementWorkflow: async () => { calls.push('lot-requirements'); return { ok: true, saveAllowed: true }; },
    getLotRequirementFormFingerprint: () => 'fields',
    Date
  });
  const pending = runPreflight(form, '42');
  assert.deepEqual(calls, ['profile-start']);
  finishProfile({ ok: true });
  assert.equal(await pending, false);
  assert.deepEqual(calls, ['profile-start', 'local-validation', 'lot-requirements']);
  assert.match(formJs, /if \(form\.dataset\.techUnitSubmitPreflightPending === 'true'\) \{[\s\S]*?return;/);
});

test('capacity failure blocks the complete local form check', () => {
  const calls = [];
  const form = { checkValidity: () => true };
  const validate = isolateFunction('function validateTechUnitFormForSubmission', {
    validateAllCapacityInputs: () => { calls.push('capacity'); return false; },
    validateHardwareRowSelections: () => true,
    updateModuleTotals: () => {},
    validateAllRequiredRepeatableSections: () => true,
    ensureAssignableLotSelectionForSubmit: () => true,
    getUnitModelComboboxInput: () => null,
    getUnitModelSelectionInput: () => null,
    getProcessorComboboxInput: () => null,
    getProcessorSelectionInput: () => null,
    findFirstInvalidControl: () => null
  });
  assert.equal(validate(form), false);
  assert.deepEqual(calls, ['capacity']);
});

test('the one-click save fix is cache-busted on every Tech Unit form entry surface', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=[^"\'\s>]+/);
  }
});
