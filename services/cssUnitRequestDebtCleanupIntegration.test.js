const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appCssPath = path.join(__dirname, '..', 'public', 'css', 'app.css');

function readAppCss() {
  return fs.readFileSync(appCssPath, 'utf8');
}

function unitRequestRuleBlocks(css) {
  return css.match(/[^{}]*css-scope-unit-requests[^{}]*\{[^{}]*\}/g) || [];
}

test('Unit Requests/detail-history important debt cannot grow beyond the normalized baseline', () => {
  const blocks = unitRequestRuleBlocks(readAppCss());
  const importantCount = blocks.reduce((count, block) => count + ((block.match(/!important/g) || []).length), 0);

  assert.ok(blocks.length > 0, 'expected Unit Requests scoped CSS rules');
  assert.ok(
    importantCount <= 191,
    `Unit Requests/detail-history CSS has ${importantCount} !important declarations; normalized ceiling is 191`
  );
});
