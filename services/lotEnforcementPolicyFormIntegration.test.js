'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Lot Create and Edit forms expose explicit Strict, Warn Only, and Open / Mixed policy choices', () => {
  const modal = read('views/fragments/lot-form-modal.ejs');
  const page = read('views/pages/management-lot-new.ejs');

  for (const source of [modal, page]) {
    assert.match(source, /name="requirementPolicyConfigValueId"/);
    assert.match(source, /requirementPolicies\.forEach/);
    assert.match(source, /policy\.description/);
  }
});

test('Lot policy selection is persisted independently from Unlimited planning', () => {
  const controller = read('controllers/lotController.js');
  const model = read('models/lotModel.js');

  assert.match(controller, /requirementPolicyConfigValueId/);
  assert.match(controller, /findSelectedRequirementPolicy/);
  assert.match(model, /addColumn\('requirement_policy_config_value_id', requirementPolicyConfigValueId\)/);
  assert.doesNotMatch(model, /getDefaultRequirementPolicyConfigValueId/);
  assert.doesNotMatch(model, /getDefaultRequirementPolicyConfigValueId\(hasUnlimitedGoal\)/);
});

test('Lot Details displays the selected enforcement policy', () => {
  const detailPage = read('views/pages/management-lot-detail.ejs');

  assert.match(detailPage, /Requirement policy:/);
  assert.match(detailPage, /lot\.requirement_policy_label/);
});
