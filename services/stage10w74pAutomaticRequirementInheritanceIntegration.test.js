'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Duplicate Lot always copies only direct Requirements and never carries source suppression markers', () => {
  const lotModel = read('models/lotModel.js');

  assert.match(lotModel, /const \[sourceDirectRequirements, sourceDirectUnitFormRules, sourceEffectiveUnitFormProfile\] = await Promise\.all/);
  assert.match(lotModel, /insertClonedRequirementRows\([\s\S]*?targetLotId,[\s\S]*?sourceDirectRequirements,[\s\S]*?currentUserId/);
  assert.doesNotMatch(lotModel, /sourceEffectiveRequirements/);
  assert.doesNotMatch(lotModel, /copyRequirementInheritanceSuppressionsForPreservedBehavior/);
  assert.doesNotMatch(lotModel, /buildRequirementBehaviorSignature/);
});

test('changing an existing Lot parent clears Requirement inheritance suppressions inside the same transaction', () => {
  const lotModel = read('models/lotModel.js');

  assert.match(lotModel, /SELECT lot_id, parent_lot_id FROM lots WHERE lot_id = \? LIMIT 1 FOR UPDATE/);
  assert.match(lotModel, /parentLotChanged = currentParentLotId !== parentLotId/);
  assert.match(lotModel, /if \(parentLotChanged\) \{[\s\S]*?clearLotRequirementInheritanceSuppressions\(Number\(lotId\), connection\)/);
  assert.match(lotModel, /async function clearLotRequirementInheritanceSuppressions[\s\S]*?DELETE FROM lot_requirement_inheritance_suppressions[\s\S]*?WHERE lot_id = \?/);
  assert.doesNotMatch(lotModel, /DELETE FROM lot_requirements\s+WHERE lot_id = \?[\s\S]*?parentLotChanged/);
});

test('Duplicate Lot explains automatic destination-parent Requirements and limits the choice to Unit Form and Browser behavior', () => {
  const modal = read('views/fragments/lot-duplicate-modal.ejs');
  const script = read('public/js/lot-form.js');

  assert.match(modal, /Direct Requirements are copied automatically/);
  assert.match(modal, /inheritance choice below applies only to Unit Form and Unit Browser behavior/);
  assert.match(modal, /data-lot-duplicate-requirement-description/);
  assert.match(modal, /Keep Unit Form & Browser Behavior from/);
  assert.match(modal, /Inherit Unit Form & Browser from Destination Parent/);
  assert.match(script, /Requirements: Direct Requirements from \$\{sourceLotName\} remain child-specific overrides/);
  assert.match(script, /Every other Requirement automatically inherits from \$\{parentLabel\}/);
  assert.match(script, /no manual Restore Inheritance is needed/);
});

test('Edit Lot tells users that reparenting restores Requirement inheritance while preserving direct child overrides', () => {
  const modal = read('views/fragments/lot-form-modal.ejs');

  assert.match(modal, /Changing the Parent Lot automatically restores Requirement inheritance from the new parent/);
  assert.match(modal, /Existing direct Requirements on this Lot remain child-specific overrides/);
});

test('Lot pages cache-bust the automatic Requirement inheritance behavior consistently', () => {
  const pages = [
    read('views/pages/management-lot-new.ejs'),
    read('views/pages/management-lot-detail.ejs'),
    read('views/pages/management-lots.ejs')
  ];

  pages.forEach((page) => {
    assert.match(page, /lot-form\.js\?v=20260828-stage10w74p-automatic-requirement-inheritance/);
  });
});
