const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appCssPath = path.join(__dirname, '..', 'public', 'css', 'app.css');

function readAppCss() {
  return fs.readFileSync(appCssPath, 'utf8');
}

function lotRuleBlocks(css) {
  return css.match(/[^{}]*css-scope-lots[^{}]*\{[^{}]*\}/g) || [];
}

test('Lots presentation important debt cannot grow beyond the normalized baseline', () => {
  const blocks = lotRuleBlocks(readAppCss());
  const importantCount = blocks.reduce((count, block) => count + ((block.match(/!important/g) || []).length), 0);

  assert.ok(blocks.length > 0, 'expected Lot-scoped CSS rules');
  assert.ok(
    importantCount <= 23,
    `Lot presentation CSS has ${importantCount} !important declarations; normalized ceiling is 23`
  );
});

test('Lots presentation cleanup keeps the complete scoped surface while preventing override-chain regrowth', () => {
  const blocks = lotRuleBlocks(readAppCss());

  assert.ok(blocks.length >= 350, 'expected the complete Lot presentation surface to remain present');
  assert.ok(blocks.length <= 421, `Lot-scoped CSS unexpectedly regrew to ${blocks.length} rule blocks`);
});
