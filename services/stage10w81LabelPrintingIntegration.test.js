'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('completed Unit Print Label action opens the existing HTMX modal system', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(table, /href="\/tech\/units\/<%= unit\.unitId %>\/print-label\/modal"/);
  assert.match(table, /hx-get="\/tech\/units\/<%= unit\.unitId %>\/print-label\/modal"/);
  assert.match(table, /data-tech-modal-trigger/);
  assert.doesNotMatch(table, /Label printing will be connected in the label-printing step/);
});

test('label printing routes retain Tech operational role authorization', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /'\/tech\/units\/:unitId\/print-label\/modal'[\s\S]*?requireRole\(techRoles\)[\s\S]*?renderTechUnitPrintLabelModal/);
  assert.match(routes, /'\/tech\/units\/:unitId\/print-label'[\s\S]*?requireRole\(techRoles\)[\s\S]*?printTechUnitLabel/);
});

test('controller requires current completion and regular-Tech ownership before printing', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /getLatestWorkCompletionMapForUnits\(\[safeUnitId\]\)/);
  assert.match(controller, /Print Label is available only after the current Unit work cycle has been completed/);
  assert.match(controller, /isRegularTechUnitBrowserUser\(req\)/);
  assert.match(controller, /Tech Users may print labels only for Units currently assigned to them/);
});

test('printer submission uses a fixed executable and server-side queue allowlist without shell execution', () => {
  const service = read('services/labelPrintingService.js');
  const config = read('config/labelPrinting.js');
  assert.match(service, /spawn\('\/usr\/bin\/lp'/);
  assert.match(service, /\['-d', queue, '-o', 'raw', '-t', title\]/);
  assert.doesNotMatch(service, /exec\(/);
  assert.match(config, /queue: 'BWT_NavidPrinter'/);
});

test('print modal exposes label selections, printer, per-template copies, preview and Print controls', () => {
  const modal = read('views/fragments/tech-unit-print-label-modal.ejs');
  for (const expected of ['name="templateKey"', 'name="printerId"', 'tech-label-preview', 'template.previewDataUri', '>Print Selected<']) {
    assert.match(modal, new RegExp(expected));
  }
  assert.match(modal, /name="quantity\[<%= template\.key %>\]"/);
  assert.match(modal, /max="<%= maxCopies %>"/);
});


test('visual-fidelity renderer uses Sharp, a deterministic container font, and a high-resolution shared-layout PNG preview', () => {
  const service = read('services/labelPrintingService.js');
  const dockerfile = read('Dockerfile');
  const packageJson = read('package.json');
  const modal = read('views/fragments/tech-unit-print-label-modal.ejs');

  assert.match(packageJson, /\"sharp\": \"0\.35\.4\"/);
  assert.match(dockerfile, /fonts-dejavu-core/);
  assert.match(service, /require\('sharp'\)/);
  assert.match(service, /font-family=\"DejaVu Sans\"/);
  assert.match(service, /threshold\(176\)/);
  assert.match(service, /data:image\/png;base64/);
  assert.match(modal, /src=\"<%= template\.previewDataUri %>\"/);
  assert.match(service, /buildUnitLabelSvg\(content, template, \{ outputScale: 2 \}\)/);
  assert.match(modal, /existing CUPS → RAW print path/);
});
