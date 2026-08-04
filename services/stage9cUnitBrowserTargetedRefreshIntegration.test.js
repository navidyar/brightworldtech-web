const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Unit Browser uses one initial HTMX load and record-level background reconciliation', () => {
  const page = read('views/pages/tech-units.ejs');
  const script = read('public/js/tech-units.js');

  assert.match(page, /data-tech-units-refresh-url="<%= tableUrl %>"/);
  assert.match(page, /hx-trigger="load"/);
  assert.doesNotMatch(page, /every 30s/);
  assert.doesNotMatch(page, /unit-saved from:body/);
  assert.match(script, /TECH_UNIT_REFRESH_INTERVAL_MS = 30000/);
  assert.match(script, /reconcileTechUnitRecords/);
  assert.match(script, /data-unit-version/);
  assert.match(script, /restoreUnitRecordState/);
  assert.match(script, /loadUnitPanelContent/);
  assert.doesNotMatch(script, /window\.location\.reload\(\)/);
});

test('Unit records carry stable server versions and separate table bodies', () => {
  const controller = read('controllers/techController.js');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(controller, /attachTechUnitBrowserVersions/);
  assert.match(controller, /createHash\('sha256'\)/);
  assert.match(controller, /browserVersion/);
  assert.match(table, /tbody[\s\S]*data-unit-record/);
  assert.match(table, /data-unit-id="<%= unit\.unitId %>"/);
  assert.match(table, /data-unit-version="<%= unit\.browserVersion \|\| '' %>"/);
});

test('Dedicated Unit Details refreshes its record instead of reloading the page', () => {
  const page = read('views/pages/tech-unit-detail.ejs');
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');

  assert.match(page, /data-tech-unit-detail-refresh-url="\/tech\/units\/<%= result\.units\[0\]\.unitId %>\/record"/);
  assert.match(routes, /'\/tech\/units\/:unitId\/record'/);
  assert.match(controller, /async function renderTechUnitRecord/);
  assert.match(controller, /singleUnitView: true/);
});

test('Unit action groups align right and QC Reject retains a restrained red treatment', () => {
  const css = read('public/css/tech-units-clean.css');
  const appCss = read('public/css/app.css');

  assert.match(css, /\.tech-summary-actions \{[\s\S]*justify-content: flex-end/);
  assert.match(css, /\.tech-detail-actions \{[\s\S]*justify-content: flex-end/);
  assert.match(css, /\.tech-unit-history-panel-actions \{[\s\S]*justify-content: flex-end/);
  assert.match(css, /\.tech-action-button--qc-reject \{[\s\S]*--tech-action-background: #faecef;[\s\S]*--tech-action-ink: #923747;/);
  assert.match(css, /\.tech-action-button--qc-accept \{[\s\S]*--tech-action-background: #eff8f2;/);
  assert.doesNotMatch(appCss, /\.tech-action-button--qc-reject/);
});

test('Unit Browser refresh assets are cache-busted together', () => {
  const page = read('views/pages/tech-units.ejs');
  const detail = read('views/pages/tech-unit-detail.ejs');

  [page, detail].forEach((template) => {
    assert.match(template, /tech-units-clean\.css\?v=20260730-stage10a-unit-export/);
    assert.match(template, /tech-units\.js\?v=20260731-stage10b-column-selection/);
  });
});
