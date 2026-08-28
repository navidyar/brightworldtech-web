'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('registry expands useful optional groups and limits new customizations to four visible groups', () => {
  const registry = require('../config/unitBrowserColumnRegistry');
  const optional = registry.listUnitBrowserOptionalColumns();

  assert.equal(registry.MAX_VISIBLE_OPTIONAL_COLUMNS, 4);
  assert.deepEqual(optional.map((column) => column.key), [
    'grade_pass_fail',
    'qc',
    'amazon_ids',
    'amazon_logistics',
    'completion',
    'system_bios',
    'display_power',
    'security_locks',
    'comments'
  ]);
  assert.ok(optional.every((column) => ['wide', 'standard', 'compact', 'tight', 'actions'].includes(column.spacingProfile)));
  assert.ok(optional.every((column) => Number.isInteger(column.growthUnits) && column.growthUnits >= 0 && column.growthUnits <= 2));
  assert.equal(registry.getUnitBrowserColumnDefinition('amazon_ids').valueWrapMode, 'copy_single_line');
  assert.equal(registry.getUnitBrowserColumnDefinition('amazon_logistics').valueWrapMode, 'copy_single_line');
});

test('Configure Unit Browser uses compact arrow ordering controls and enforces the four-group limit in UI and server policy', () => {
  const modal = read('views/fragments/lot-unit-browser-layout-modal.ejs');
  const script = read('public/js/lot-unit-browser-layout.js');
  const editor = read('services/lotUnitBrowserLayoutEditor.js');

  assert.match(modal, /data-lot-unit-browser-max-visible/);
  assert.match(modal, /configuration saved before the new limit/);
  assert.match(modal, />↑<\/span>/);
  assert.match(modal, />↓<\/span>/);
  assert.doesNotMatch(modal, />Move Up<\/button>/);
  assert.doesNotMatch(modal, />Move Down<\/button>/);
  assert.match(script, /visibleControls\.length > maxVisible/);
  assert.match(editor, /visibleKeys\.length > MAX_VISIBLE_OPTIONAL_COLUMNS/);
});

test('Comments group exposes compact links backed by existing Buyer, general, hardware, and cosmetic data', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /key: 'buyer', label: 'Buyer Comments'/);
  assert.match(table, /key: 'general', label: 'General Comments'/);
  assert.match(table, /key: 'hardware', label: 'Hardware Comments'/);
  assert.match(table, /key: 'cosmetic', label: 'Cosmetic Comments'/);
  assert.match(table, /data-unit-browser-comment-link/);
  assert.match(table, /href="\/tech\/units\/<%= unit\.unitId %>"/);
  assert.match(table, /data-unit-browser-comment-source/);
  assert.match(table, /<span id="<%= sourceId %>" hidden>/);
});

test('comment tooltip is a body-level fixed overlay with hover and keyboard-focus behavior', () => {
  const script = read('public/js/tech-units.js');
  const css = read('public/css/tech-units-clean.css');

  assert.match(script, /document\.body\.appendChild\(tooltip\)/);
  assert.match(script, /document\.body\.addEventListener\('mouseover'/);
  assert.match(script, /document\.body\.addEventListener\('focusin'/);
  assert.match(script, /document\.body\.addEventListener\('focusout'/);
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /window\.addEventListener\('scroll', positionUnitBrowserCommentTooltip, true\)/);
  assert.match(script, /scheduleUnitBrowserCommentTooltipHide/);
  assert.match(css, /\.tech-unit-browser-comment-tooltip \{[\s\S]*?position: fixed;/);
  assert.match(css, /max-width: min\(430px, calc\(100vw - 24px\)\)/);
  assert.match(css, /white-space: pre-wrap/);
  assert.match(css, /pointer-events: auto/);
  assert.match(css, /user-select: text/);
});

test('Browser spacing is compact globally but supports per-group spacing profiles', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(table, /tech-units-browser-cell--<%= column\.spacingProfile %>/);
  assert.match(table, /tech-units-browser-header--<%= column\.spacingProfile %>/);
  assert.match(css, /--tu-cell-inline-padding: clamp\(5px, 0\.42cqi, 8px\)/);
  assert.match(css, /tech-units-browser-cell--compact/);
  assert.match(css, /tech-units-browser-cell--tight/);
  assert.match(css, /tech-units-browser-cell--actions/);
  assert.match(table, /tech-units-col--grow-<%= column\.growthUnits %>/);
  assert.match(table, /--tu-secondary-growth-unit-count: <%= browserPresentation\.secondaryGrowthUnitCount %>/);
  assert.equal(require('../config/unitBrowserColumnRegistry').getUnitBrowserColumnDefinition('unit_actions').growthUnits, 0);
  assert.equal(require('../config/unitBrowserColumnRegistry').getUnitBrowserColumnDefinition('created_work_assignment').growthUnits, 1);
  assert.match(css, /--tu-secondary-growth-unit:/);
  assert.match(css, /tech-units-col--grow-2/);
});

test('copy-sensitive Browser identifiers remain single-line and are never ellipsized by the Stage 10W73C override', () => {
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /\.tech-unit-summary-id-value,[\s\S]*?tech-units-browser-cell--wrap-copy_single_line[\s\S]*?white-space: nowrap;/);
  assert.match(read('views/fragments/tech-units-table.ejs'), /tech-units-browser-cell--wrap-<%= column\.valueWrapMode %>/);
  assert.match(css, /text-overflow: clip;/);
  assert.match(css, /overflow: visible;/);
  assert.match(css, /overflow-wrap: normal;/);
});

test('new Completion, System/BIOS, Display/Power, and Security/Locks groups reuse data already attached to Browser units', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  for (const key of ['completion', 'system_bios', 'display_power', 'security_locks']) {
    assert.match(table, new RegExp(`column\\.key === '${key}'`));
  }
  assert.match(table, /latestCompletion\.completedByName/);
  assert.match(table, /specifications\.osBuild/);
  assert.match(table, /specifications\.biosVersion/);
  assert.match(table, /specsLabels\.nativeScreenResolutionConfigValueId/);
  assert.match(table, /specsLabels\.mdmLockConfigValueId/);
});

test('Stage 10W73C remains presentation-only with Export independent', () => {
  const exportContract = read('config/unitExportContract.js');
  const exportService = read('services/unitExportService.js');

  assert.doesNotMatch(exportContract, /unitBrowserColumnRegistry|lotUnitBrowserLayout/);
  assert.doesNotMatch(exportService, /unitBrowserColumnRegistry|lotUnitBrowserLayout/);
});
