const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('authenticated Unit Browser users receive a dedicated realtime event stream', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');

  assert.match(routes, /\/tech\/units\/events[\s\S]*?requireAuth[\s\S]*?requireRole\(unitBrowserRoles\)[\s\S]*?streamTechUnitBrowserChanges/);
  assert.match(controller, /Content-Type': 'text\/event-stream; charset=utf-8'/);
  assert.match(controller, /X-Accel-Buffering': 'no'/);
  assert.match(controller, /event: unit-browser-change/);
  assert.match(controller, /: keep-alive/);
  assert.match(controller, /subscribeToUnitBrowserChanges/);
});

test('completion and QC mutations publish cross-session Unit Browser changes', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /recordUnitWorkCompletion[\s\S]*?publishUnitBrowserChange\(\{ unitId: preview\.unitId, changeType: 'work-completed' \}\)/);
  assert.match(controller, /recordQcReview[\s\S]*?publishUnitBrowserChange\(\{ unitId, changeType: 'qc-reviewed' \}\)/);
  assert.match(controller, /reverseUnitWorkCompletion[\s\S]*?publishUnitBrowserChange\(\{ unitId: preview\.unitId, changeType: 'work-completion-reversed' \}\)/);
});

test('the browser refreshes immediately on realtime changes and retains polling as fallback', () => {
  const script = read('public/js/tech-units.js');

  assert.match(script, /new EventSource\('\/tech\/units\/events'\)/);
  assert.match(script, /addEventListener\('unit-browser-change',[\s\S]*?queueVisibleTechUnitRefresh/);
  assert.match(script, /TECH_UNIT_REFRESH_INTERVAL_MS = 30000/);
  assert.match(script, /window\.setInterval\([\s\S]*?refreshVisibleTechUnitRecords/);
  assert.match(script, /pagehide[\s\S]*?techUnitEventSource\.close\(\)/);
});

test('QC status symbols use one SVG canvas for the circle and centered mark', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const details = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
  const icon = read('views/fragments/tech-unit-qc-status-icon.ejs');
  const css = read('public/css/app.css');

  assert.equal((table.match(/include\('tech-unit-qc-status-icon'/g) || []).length, 3);
  assert.match(details, /include\('tech-unit-qc-status-icon'/);
  assert.doesNotMatch(table, /tech-qc-status-indicator[^\n]*>[✓×]</);
  assert.doesNotMatch(details, /tech-qc-status-indicator[^\n]*>[✓×]</);
  assert.match(icon, /viewBox="0 0 22 22"/);
  assert.match(icon, /<circle class="tech-qc-status-indicator__disc" cx="11" cy="11"/);
  assert.match(icon, /M7\.5 7\.5 14\.5 14\.5M14\.5 7\.5 7\.5 14\.5/);
  assert.match(css, /\.tech-qc-status-indicator \{[\s\S]*?width: 22px;[\s\S]*?height: 22px;[\s\S]*?border: 0;/);
  assert.match(css, /\.tech-qc-status-indicator__mark[\s\S]*?stroke-linecap: round/);
});

test('Unit Browser assets are cache-busted for the realtime and icon changes', () => {
  for (const page of ['views/pages/tech-units.ejs', 'views/pages/tech-unit-detail.ejs']) {
    const source = read(page);
    assert.match(source, /tech-units-clean\.css\?v=20260819-stage10w68o-toggle-label-cleanup/);
    assert.match(source, /tech-units\.js\?v=20260819-stage10w68l-filter-toggles/);
  }
});
