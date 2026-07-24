const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateHeadTemplate,
  validateSharedVisualCss,
  validateFeatureSafetyCss,
  validatePageStylesheetPlacement
} = require('./sharedCssFoundationValidator');

test('head template requires page CSS before shared visual and feature CSS', () => {
  const valid = `
    stylesheets.forEach((stylesheetHref) => {})
    /css/app.css?v=20260723-shared-ui-foundation
    /css/features.css?v=20260723-shared-ui-foundation
  `;
  assert.deepEqual(validateHeadTemplate(valid), []);

  const invalid = `
    /css/app.css?v=20260723-shared-ui-foundation
    stylesheets.forEach((stylesheetHref) => {})
    /css/features.css?v=20260723-shared-ui-foundation
  `;
  assert.ok(validateHeadTemplate(invalid).some((error) => error.includes('after legacy/page')));
});

test('shared visual CSS rejects protected feature selectors', () => {
  const valid = '--ui-blue: #315e9d; .primary-button{} .secondary-button{} .danger-button{} .modal-panel{} .table-card{} .form-section{}';
  assert.deepEqual(validateSharedVisualCss(valid), []);

  const invalid = `${valid} .lot-tree-toggle{}`;
  assert.ok(validateSharedVisualCss(invalid).some((error) => error.includes('lot-tree-toggle')));
});

test('feature safety CSS requires protected hidden-state rules', () => {
  const valid = `
    [hidden]{}
    .management-lots-table tr.lot-tree-row-hidden{}
    .tech-unit-form [data-unit-form-field-key][hidden]{}
    #modal-root:empty{}
  `;
  assert.deepEqual(validateFeatureSafetyCss(valid), []);
  assert.ok(validateFeatureSafetyCss('[hidden]{}').length > 0);
});

test('normal pages do not load page CSS after the shared head partial', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-pages-'));
  fs.writeFileSync(path.join(directory, 'normal.ejs'), '<%- include("head") %>');
  fs.writeFileSync(path.join(directory, 'error.ejs'), '<link rel="stylesheet" href="/css/error.css">');
  assert.deepEqual(validatePageStylesheetPlacement(directory), []);

  fs.writeFileSync(path.join(directory, 'broken.ejs'), '<link rel="stylesheet" href="/css/broken.css">');
  assert.ok(validatePageStylesheetPlacement(directory).some((error) => error.includes('broken.ejs')));
});
