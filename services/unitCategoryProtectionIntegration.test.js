'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getUnitFormFieldDefinition } = require('../config/unitFormFieldRegistry');
const { validateUnitFormFieldBindings } = require('./unitFormFieldBindingValidator');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Create and Edit keep Unit Category required outside Lot managed fields', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const category = form.match(/<label class="form-field" data-unit-form-protected-field-key="unit_category">([\s\S]*?)<\/label>/);
  assert.ok(category);
  assert.match(category[1], /<select name="unitCategoryConfigValueId" required data-unit-category-select>/);
  assert.doesNotMatch(form, /data-unit-form-field-key="unit_category"/);
  assert.equal(validateUnitFormFieldBindings(form).valid, true);

  const definition = getUnitFormFieldDefinition('unit_category');
  assert.equal(definition.protected, true);
  assert.equal(definition.defaultRequired, true);
  assert.equal(definition.enabledForLotRules, false);
});

test('Lot refresh cannot clear category required state, while both save modes check it', () => {
  const browser = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');
  assert.match(browser, /getLotConfigurableFieldWrappers\(form\)[\s\S]*?form\.querySelectorAll\('\[data-unit-form-field-key\]'\)/);
  assert.match(browser, /function applyDefaultLotUnitFormProfile\(form\)/);
  assert.match(browser, /function applyLotUnitFormProfile\(form, profile/);
  assert.match(controller, /if \(!validationFormData\.unitCategoryConfigValueId \|\| !isPositiveInteger\(validationFormData\.unitCategoryConfigValueId\)\) \{\s*errors\.push\('Unit category is required\.'\)/);
  assert.match(controller, /validateUnitForm\(authoritativeFormData, formOptions, mode\)/);
  assert.match(browser, /\[data-unit-form-protected-field-key="\$\{fieldKey\}"\]/);
});
