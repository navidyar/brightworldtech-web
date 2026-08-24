'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('unpin immediately overrides sidebar hover and focus-within during the hide transition', () => {
  const script = read('public/js/sidebar.js');
  const css = read('public/css/style.css');

  assert.match(script, /sidebar\.classList\.add\('is-desktop-unpinning'\)/);
  assert.match(script, /document\.activeElement === pinButton[\s\S]*pinButton\.blur\(\)/);
  assert.match(script, /window\.setTimeout\([\s\S]*is-desktop-unpinning[\s\S]*220/);
  assert.match(css, /html:not\(\[data-sidebar-pinned="true"\]\) \.sidebar\.is-desktop-unpinning[\s\S]*translateX\(calc\(-100% \+ var\(--sidebar-edge-trigger\)\)\)/);
});

test('Create and Edit User use a non-sticky modal header without changing other user dialogs', () => {
  const createModal = read('views/fragments/management-user-create-modal.ejs');
  const editModal = read('views/fragments/management-user-edit-modal.ejs');
  const actionModal = read('views/fragments/management-user-action-modal.ejs');
  const css = read('public/css/management.css');

  assert.match(createModal, /management-user-modal management-user-form-modal/);
  assert.match(editModal, /management-user-modal management-user-form-modal/);
  assert.doesNotMatch(actionModal, /management-user-form-modal/);
  assert.match(css, /\.management-user-form-modal > \.modal-header\s*\{\s*position: static;/);
});

test('shared modal focus trapping respects tabindex=-1 and already-handled Tab events', () => {
  const script = read('public/js/modal.js');

  assert.match(script, /function isTabbable\(element\)/);
  assert.match(script, /Number\(element\.tabIndex\) >= 0/);
  assert.match(script, /querySelectorAll\(focusableSelector\)\)\.filter\(isTabbable\)/);
  assert.match(script, /event\.key !== 'Tab' \|\| event\.defaultPrevented/);
});

test('Add/Edit Unit modal uses a field-only linear Tab path and preserves outcome radios', () => {
  const script = read('public/js/tech-unit-form.js');
  const markup = read('views/fragments/tech-unit-form.ejs');

  const selectorBlock = script.slice(
    script.indexOf('const UNIT_FORM_SEQUENTIAL_FOCUS_SELECTOR'),
    script.indexOf('function removeRepeatableActionsFromTabOrder'),
  );

  assert.match(selectorBlock, /input:not\(\[type="hidden"\]\)/);
  assert.match(selectorBlock, /'select'/);
  assert.match(selectorBlock, /'textarea'/);
  assert.doesNotMatch(selectorBlock, /'button'/);
  assert.doesNotMatch(selectorBlock, /a\[href\]/);

  assert.match(script, /function handleUnitModalSequentialTab\(event\)/);
  assert.match(script, /const nextIndex = \(currentIndex \+ offset \+ focusTargets\.length\) % focusTargets\.length/);
  assert.match(script, /document\.addEventListener\('keydown', handleUnitModalSequentialTab, true\);[\s\S]*document\.addEventListener\('keydown', handleOutcomeSequentialTab, true\);/);
  assert.match(script, /modal\.querySelectorAll\('button'\)[\s\S]*setAttribute\('tabindex', '-1'\)/);
  assert.equal((script.match(/optionButton\.tabIndex = -1;/g) || []).length, 3);

  assert.match(markup, /name="outcomeCode"[\s\S]*tabindex="0"[\s\S]*data-outcome-tab-stop/);
});

test('background Lot-profile changes move focus forward instead of losing it to the top of the modal', () => {
  const script = read('public/js/tech-unit-form.js');

  assert.match(script, /function restoreSequentialFocusAfterVisibilityChange\(form, previousFocus, previousTargets\)/);
  assert.match(script, /\.slice\(previousIndex \+ 1\)[\s\S]*currentTargetSet\.has/);
  assert.match(script, /restoreSequentialFocusAfterVisibilityChange\(form, activeControl, previousFocusTargets\)/);
});

test('modified interaction assets are cache-busted at their entry points', () => {
  const head = read('views/partials/head.ejs');
  const users = read('views/pages/management-users.ejs');
  const techPages = [
    read('views/pages/tech-units.ejs'),
    read('views/pages/tech-unit-form.ejs'),
    read('views/pages/tech-unit-detail.ejs'),
  ];

  assert.match(head, /style\.css\?v=20260819-stage10w68p-interaction-refinements/);
  assert.match(head, /sidebar\.js\?v=20260819-stage10w68p-interaction-refinements/);
  assert.match(users, /management\.css\?v=20260819-stage10w68p-interaction-refinements/);
  assert.match(users, /modal\.js\?v=20260819-stage10w68p-interaction-refinements/);
  techPages.forEach((page) => {
    assert.match(page, /modal\.js\?v=20260819-stage10w68p-interaction-refinements/);
    assert.match(page, /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/);
  });
});
