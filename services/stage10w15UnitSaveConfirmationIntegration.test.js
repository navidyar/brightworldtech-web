'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('successful Create and Edit modal responses publish persisted identifiers after the empty modal swap', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /function buildUnitFormSavedTriggerDetail\([\s\S]*?source: 'tech-unit-form'[\s\S]*?operation: operation === 'edit' \? 'edit' : 'create'[\s\S]*?assetTag:[\s\S]*?unitSerialNumber:[\s\S]*?biosSerialNumber:/);
  assert.match(controller, /function setUnitFormSavedTrigger\(res, detail\)[\s\S]*?HX-Trigger-After-Swap[\s\S]*?'unit-saved': detail/);
  assert.match(controller, /savedUnit = await createTechUnitWithAudit\([\s\S]*?operation: 'create'[\s\S]*?unitId: savedUnit\.unitId[\s\S]*?assetTag: savedUnit\.assetTag[\s\S]*?unitSerialNumber: formData\.unitSerialNumber[\s\S]*?biosSerialNumber: formData\.biosSerialNumber/);
  assert.match(controller, /publishUnitBrowserChange\(\{ unitId, changeType: 'unit-updated' \}\);[\s\S]*?operation: 'edit'[\s\S]*?assetTag: existingFormData && existingFormData\.assetTag[\s\S]*?unitSerialNumber: formData\.unitSerialNumber[\s\S]*?biosSerialNumber: formData\.biosSerialNumber/);
});

test('Create confirmation captures the committed generated Asset Tag without changing the model return contract', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(controller, /let committedAssetNumber = null;/);
  assert.match(controller, /committedAssetNumber = Number\(assetNumber\) \|\| null;/);
  assert.match(controller, /return \{\s*unitId: Number\(unitId\),\s*assetTag: committedAssetNumber[\s\S]*?getDisplayAssetTag\(committedAssetNumber\)/);
  assert.match(model, /await connection\.commit\(\);[\s\S]*?return unitId;/);
});

test('modal form prevents duplicate Create or Update requests while HTMX is saving', () => {
  const form = read('views/fragments/tech-unit-form.ejs');

  assert.match(form, /hx-disabled-elt="find button\[type=\'submit\'\]"/);
});

test('Unit Browser centers a selectable 30-second confirmation with a raised shadow and responsive reflow', () => {
  const page = read('views/pages/tech-units.ejs');
  const browser = read('public/js/tech-units.js');
  const css = read('public/css/tech-units-clean.css');

  assert.match(page, /class="tech-units-clean-page-heading tech-units-clean-page-heading--save-status"[\s\S]*?<h1><%= isQcUnitBrowserUser \? 'QC Unit Browser' : 'Tech Units Browser' %><\/h1>[\s\S]*?id="tech-unit-save-notification"[\s\S]*?class="message success tech-unit-save-notification"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"[\s\S]*?hidden[\s\S]*?class="tech-units-clean-heading-actions"/);
  assert.doesNotMatch(page, /class="tech-filter-actions"[\s\S]*?id="tech-unit-save-notification"/);
  assert.match(browser, /const UNIT_SAVE_CONFIRMATION_TIMEOUT_MS = 30000;/);
  assert.match(browser, /detail\.source !== 'tech-unit-form'/);
  assert.match(browser, /\['Asset Tag',[\s\S]*?\['Unit Serial',[\s\S]*?\['BIOS Serial'/);
  assert.match(browser, /document\.body\.addEventListener\('unit-saved',[\s\S]*?showUnitSaveConfirmation\(event\.detail \|\| null\)/);
  assert.match(browser, /notification\.textContent = message;[\s\S]*?notification\.hidden = false;[\s\S]*?window\.setTimeout\([\s\S]*?UNIT_SAVE_CONFIRMATION_TIMEOUT_MS/);
  assert.match(css, /\.tech-units-clean-page-heading--save-status \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(280px, 560px\) minmax\(0, 1fr\);/);
  assert.match(css, /\.tech-units-clean-page-heading--save-status > \.tech-unit-save-notification \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;[\s\S]*?justify-self: center;/);
  assert.match(css, /\.tech-unit-save-notification \{[\s\S]*?position: static;[\s\S]*?max-width: 560px;[\s\S]*?box-shadow: 0 8px 22px rgba\(29, 44, 69, 0\.16\), 0 2px 6px rgba\(29, 44, 69, 0\.1\);[\s\S]*?pointer-events: auto;[\s\S]*?user-select: text;[\s\S]*?-webkit-user-select: text;[\s\S]*?cursor: text;[\s\S]*?text-align: center;[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(css, /@media \(max-width: 1080px\) \{[\s\S]*?\.tech-units-clean-page-heading--save-status \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?\.tech-unit-save-notification \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?grid-row: 2;[\s\S]*?max-width: 760px;/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.tech-units-clean-page-heading--save-status \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.tech-unit-save-notification \{[\s\S]*?grid-row: 2;[\s\S]*?max-width: none;/);
  assert.match(css, /\.tech-filter-actions \{[\s\S]*?display: flex;[\s\S]*?justify-content: space-between;/);
  assert.doesNotMatch(css, /\.tech-unit-save-notification \{[^}]*?position: fixed;/);
});

test('focused validation command covers confirmation behavior and existing modal submission policy', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['validate:unit-save-confirmation'],
    'node --test services/stage10w15UnitSaveConfirmationIntegration.test.js services/stage10w10SerialScannerEnterGuardIntegration.test.js services/stage10w12UnitFormTabOrderIntegration.test.js services/unitFormSubmissionPolicy.test.js && node --check controllers/techController.js && node --check public/js/tech-units.js'
  );
});
