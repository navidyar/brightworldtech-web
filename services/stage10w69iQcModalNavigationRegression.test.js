const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('history replacement leaves application-controlled modal links to their modal handlers', () => {
  const source = read('public/js/navigation-policy.js');

  assert.match(source, /function isApplicationHandledAnchor\(anchor\)/);
  assert.match(source, /data-tech-modal-trigger/);
  assert.match(source, /data-modal-trigger/);
  assert.match(source, /hasHtmxNavigation\(anchor\) \|\| isApplicationHandledAnchor\(anchor\)/);
});

test('QC review actions continue using the shared modal trigger contract', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /qc-review\/accepted\/modal[\s\S]*?data-tech-modal-trigger/);
  assert.match(table, /qc-review\/rejected\/modal[\s\S]*?data-tech-modal-trigger/);
  assert.match(table, /qc-review\/details\/modal[\s\S]*?data-tech-modal-trigger/);
});

test('navigation policy asset version is bumped so browsers receive the modal exemption immediately', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /navigation-policy\.js\?v=20260820-stage10w69l-request-modal-exemption/);
});
