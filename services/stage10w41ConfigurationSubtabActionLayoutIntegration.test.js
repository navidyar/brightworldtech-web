const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('configuration subtab row actions stay horizontal at normal widths', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.configuration-value-actions\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/);
  assert.match(css, /\.model-catalog-row-actions\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/);
});

test('configuration subtab row actions stack only at tablet-sized widths', () => {
  const css = read('public/css/app.css');

  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*?\.configuration-value-actions,\s*\n\s*\.model-catalog-row-actions\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*stretch;[\s\S]*?white-space:\s*normal;/);
  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*?\.configuration-value-actions\s*>\s*\*,\s*\n\s*\.model-catalog-row-actions\s*>\s*\*\s*\{[\s\S]*?width:\s*100%;/);
  assert.doesNotMatch(css, /@media \(max-width:\s*560px\)[\s\S]*?\.configuration-value-actions\s*\{/);
});

test('all configuration catalog subtabs use the shared row action wrappers', () => {
  const configValues = read('views/pages/management-config.ejs');
  const processors = read('views/pages/management-processors.ejs');
  const models = read('views/pages/management-unit-models.ejs');
  const families = read('views/pages/processor-families.ejs');

  assert.match(configValues, /class="configuration-value-actions"/);
  assert.match(processors, /class="model-catalog-row-actions"/);
  assert.match(models, /class="model-catalog-row-actions"/);
  assert.match(families, /class="model-catalog-row-actions"/);
});

test('shared app stylesheet cache version is bumped for configuration action layout', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /app\.css\?v=20260811-stage10w41-config-subtab-actions/);
});
