'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Duplicate Lot inheritance identifies the source and destination in user-facing language', () => {
  const modal = read('views/fragments/lot-duplicate-modal.ejs');

  assert.match(modal, /Source: <strong><%= sourceLot\.lot_name %><\/strong>/);
  assert.match(modal, /data-lot-duplicate-destination-label>Root-level Lot \(no Parent Lot\)/);
  assert.match(modal, /Keep Unit Form & Browser Behavior from <%= sourceLot\.lot_name %>/);
  assert.match(modal, /Inherit Unit Form & Browser from Destination Parent/);
  assert.match(modal, /data-source-lot-name="<%= sourceLot\.lot_name %>"/);
});

test('Duplicate Lot inheritance descriptions separate automatic Requirements from Unit Form and Browser choices', () => {
  const modal = read('views/fragments/lot-duplicate-modal.ejs');
  const script = read('public/js/lot-form.js');

  assert.match(modal, /Direct Requirements are copied automatically/);
  assert.match(modal, /inheritance choice below applies only to Unit Form and Unit Browser behavior/);
  assert.match(script, /Every other Requirement automatically inherits from/);
  assert.match(script, /no manual Restore Inheritance is needed/);
  assert.match(script, /effective Unit Form behavior and Unit Browser layout/);
  assert.match(script, /Direct Unit Form rules and direct Unit Browser customization/);
});

test('destination-parent inheritance becomes available only after Child placement has an actual Parent Lot', () => {
  const script = read('public/js/lot-form.js');
  const controller = read('controllers/lotController.js');

  assert.match(script, /const hasDestinationParent = Boolean\(parentLabel\)/);
  assert.match(script, /parentInheritance\.disabled = !hasDestinationParent/);
  assert.match(script, /parentSelect\.addEventListener\('change', syncPlacement\)/);
  assert.match(script, /Choose a destination Parent Lot to enable this Unit Form and Unit Browser option/);
  assert.match(script, /Root-level Lot \(no Parent Lot\)/);
  assert.match(controller, /inheritanceMode: placementMode === 'child' && requestedInheritanceMode === 'new_parent'[\s\S]*?'new_parent'[\s\S]*?'preserve_source'/);
});

test('Lot pages cache-bust the duplicate inheritance behavior script consistently', () => {
  const pages = [
    read('views/pages/management-lot-new.ejs'),
    read('views/pages/management-lot-detail.ejs'),
    read('views/pages/management-lots.ejs')
  ];

  pages.forEach((page) => {
    assert.match(page, /lot-form\.js\?v=20260828-stage10w74p-automatic-requirement-inheritance/);
  });
});
