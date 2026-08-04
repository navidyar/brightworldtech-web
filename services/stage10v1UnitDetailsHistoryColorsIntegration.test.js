const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const css = read('public/css/tech-units-clean.css');
const unitsPage = read('views/pages/tech-units.ejs');
const detailPage = read('views/pages/tech-unit-detail.ejs');

test('Unit History restores the original violet header palette from the pre-10V workspace', () => {
  assert.match(css, /\.tech-detail-header--history\s*\{[\s\S]*?border-bottom-color:\s*#cfc3e5;[\s\S]*?background:\s*#f7f3ff;/);
  assert.match(css, /\.tech-detail-header--history \.tech-detail-title strong\s*\{[\s\S]*?color:\s*#4c3f73;/);
  assert.match(css, /\.tech-detail-header--history \.tech-detail-title span\s*\{[\s\S]*?color:\s*#74678f;/);
});

test('Unit Details uses a distinct warm-orange header instead of steel blue', () => {
  assert.match(css, /\.tech-detail-header--details\s*\{[\s\S]*?border-bottom-color:\s*#dcae78;[\s\S]*?background:\s*#fff2e2;/);
  assert.match(css, /\.tech-detail-header--details \.tech-detail-title strong\s*\{[\s\S]*?color:\s*#704116;/);
  assert.match(css, /\.tech-detail-header--details \.tech-detail-title span\s*\{[\s\S]*?color:\s*#8a6340;/);
  assert.doesNotMatch(css, /#9eb5cb|#e7f0f8|#284865|#58718a/);
});

test('the later compact-detail rule no longer overrides either semantic header color', () => {
  const compactRule = css.match(/\/\* Unit Details R\.1[\s\S]*?\.tech-units-clean-page \.tech-detail-header\s*\{([\s\S]*?)\}/);
  assert.ok(compactRule, 'expected compact Unit Details header rule');
  assert.match(compactRule[1], /padding:\s*10px 12px;/);
  assert.doesNotMatch(compactRule[1], /background:|border-bottom-color:/);
});

test('Unit Browser and standalone detail pages bust the corrected color stylesheet cache', () => {
  const expectedVersion = 'tech-units-clean.css?v=20260803-stage10v1-history-detail-colors';
  assert.match(unitsPage, new RegExp(expectedVersion.replace(/[.?]/g, '\\$&')));
  assert.match(detailPage, new RegExp(expectedVersion.replace(/[.?]/g, '\\$&')));
});
