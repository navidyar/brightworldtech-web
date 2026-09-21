const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appCssPath = path.join(__dirname, '..', 'public', 'css', 'app.css');

function readAppCss() {
  return fs.readFileSync(appCssPath, 'utf8');
}

function techUnitRuleBlocks(css) {
  return css.match(/[^{}]*css-scope-tech-units[^{}]*\{[^{}]*\}/g) || [];
}

test('Tech Units presentation important debt cannot grow beyond the normalized baseline', () => {
  const blocks = techUnitRuleBlocks(readAppCss());
  const importantCount = blocks.reduce((count, block) => count + ((block.match(/!important/g) || []).length), 0);

  assert.ok(blocks.length > 0, 'expected Tech Units scoped CSS rules');
  assert.ok(
    importantCount <= 21,
    `Tech Units CSS has ${importantCount} !important declarations; normalized ceiling is 21`
  );
});

test('Tech Units cleanup keeps scoped rules while removing provably superseded declaration debt', () => {
  const css = readAppCss();
  const blocks = techUnitRuleBlocks(css);

  assert.ok(blocks.length >= 700, 'expected the complete Tech Units shared CSS surface to remain present');
  assert.ok(blocks.length <= 767, `Tech Units scoped CSS unexpectedly regrew to ${blocks.length} rule blocks`);
});
