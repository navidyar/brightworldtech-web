'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Management Lot Details shows only internal notes after the Lot summary', () => {
  const page = read('views/pages/management-lot-detail.ejs');
  const summaryEnd = page.indexOf('</section>', page.indexOf('lot-detail-summary-panel'));
  const notesIndex = page.indexOf('lot-detail-management-notes-section');

  assert.ok(summaryEnd >= 0);
  assert.ok(notesIndex > summaryEnd);
  assert.match(page, /<h2[^>]*>Internal Management Notes<\/h2>/);
  assert.match(page, /lot-detail-management-note[^>]*><%= String\(lot\.notes/);
  assert.doesNotMatch(page, /Tech Objectives[\s\S]{0,300}lot\.objectives/);
});

test('Lot editor clearly distinguishes technician objectives from internal notes', () => {
  const modal = read('views/fragments/lot-form-modal.ejs');
  const createPage = read('views/pages/management-lot-new.ejs');

  for (const source of [modal, createPage]) {
    assert.match(source, /<span>Tech Objectives<\/span>/);
    assert.match(source, /<span>Internal Management Notes<\/span>/);
  }
});

test('Unit Create and Edit carries Lot objectives through the assignable Lot selector', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const script = read('public/js/tech-unit-form.js');

  assert.match(form, /data-lot-objectives=/);
  assert.match(form, /lot\.objectives/);
  assert.match(form, /data-lot-objectives-panel/);
  assert.match(form, /tech-lot-objectives-disclosure--form/);
  assert.doesNotMatch(form, /data-lot-objectives-preview/);
  assert.match(form, /data-lot-objectives-text/);
  assert.match(script, /function updateAssignableLotObjectives\(form\)/);
  assert.match(script, /updateAssignableLotObjectives\(form\);/);
});

test('Lot-filtered Unit Browser attaches objectives directly to the Lot filter without a text preview', () => {
  const page = read('views/pages/tech-units.ejs');
  const filterForm = page.indexOf('tech-units-clean-filter-workspace');
  const lotField = page.indexOf('tech-lot-filter-field');
  const objectivesIndex = page.indexOf('tech-lot-objectives-disclosure--browser');
  const lotSelect = page.indexOf('id="tech-units-lot-filter"');

  assert.match(page, /selectedBrowserLotObjectives/);
  assert.ok(lotField > filterForm);
  assert.ok(objectivesIndex > lotField && objectivesIndex < lotSelect);
  assert.match(page, /<summary[^>]*>[\s\S]*?Objectives<\/summary>/);
  assert.doesNotMatch(page, /tech-lot-objectives-preview[^>]*><%= selectedBrowserLotObjectives/);
  assert.doesNotMatch(page, /Lot Objectives<\/span>/);
});

test('Lot Objectives use clean overlay popovers that dismiss outside themselves', () => {
  const css = read('public/css/app.css');
  const script = read('public/js/tech-unit-form.js');

  assert.match(css, /tech-lot-objectives-disclosure > \.tech-lot-objectives-body[\s\S]*?position: absolute/);
  assert.match(css, /transform: translateX\(var\(--tech-lot-objectives-shift-x, 0px\)\)/);
  assert.doesNotMatch(css, /tech-lot-objectives-disclosure--browser[\s\S]{0,700}border-left:\s*3px solid var\(--ui-blue\)/);
  assert.match(script, /function positionLotObjectivesDisclosure\(disclosure\)/);
  assert.match(script, /window\.innerWidth - bodyRect\.width - viewportGap/);
  assert.match(script, /function closeLotObjectivesDisclosures\(exceptDisclosure = null\)/);
  assert.match(script, /document\.addEventListener\('pointerdown'/);
  assert.match(script, /document\.addEventListener\('focusin'/);
  assert.match(script, /event\.key !== 'Escape'/);
});

test('every Unit-form surface cache-busts the Lot Objectives client behavior', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=20260924-lot-objectives-viewport-clamp/);
  }
});
