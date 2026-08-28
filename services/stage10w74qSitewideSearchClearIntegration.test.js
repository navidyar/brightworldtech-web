const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('shared head loads one cache-busted site-wide clear-control asset', () => {
  const head = read('views/partials/head.ejs');

  assert.match(head, /search-clear-controls\.js\?v=20260828-stage10w74q-sitewide-search-clear/);
  assert.match(head, /app\.css\?v=[^"']+/);
});

test('site-wide clear control covers search inputs and searchable combobox inputs including HTMX swaps', () => {
  const script = read('public/js/search-clear-controls.js');

  assert.match(script, /input\[type="search"\]/);
  assert.match(script, /input\[role="combobox"\]\[aria-autocomplete="list"\]/);
  assert.match(script, /htmx:afterSwap/);
  assert.match(script, /data-search-clear-exempt/);
  assert.match(script, /data-search-clear-shell/);
  assert.match(script, /data-search-clear-button/);
});

test('clear action is accessible, keeps combobox focus stable, and emits normal form events', () => {
  const script = read('public/js/search-clear-controls.js');

  assert.match(script, /button\.type = 'button'/);
  assert.match(script, /button\.setAttribute\('aria-label', getClearLabel\(input\)\)/);
  assert.match(script, /Keep focus inside custom comboboxes[\s\S]*event\.preventDefault\(\)/);
  assert.match(script, /input\.value = ''/);
  assert.match(script, /new Event\('input', \{ bubbles: true \}\)/);
  assert.match(script, /new Event\('change', \{ bubbles: true \}\)/);
  assert.match(script, /input\.focus\(\{ preventScroll: true \}\)/);
});

test('clear control styling reserves existing trailing icons and suppresses inconsistent native search cancel buttons', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.site-search-clear-shell--reserved-icon > input/);
  const script = read('public/js/search-clear-controls.js');
  assert.match(script, /\.tech-pallet-filter-input/);
  assert.match(script, /\.lot-requirement-value-search/);
  assert.match(css, /::-webkit-search-cancel-button/);
  assert.match(css, /\.site-search-clear-button\[hidden\]/);
});

test('every current searchable-select style input is covered by the shared selector', () => {
  const viewFiles = walk(path.join(root, 'views')).filter((file) => file.endsWith('.ejs'));
  const searchableComboboxes = [];
  const searchInputs = [];

  viewFiles.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(root, file);

    if (/aria-autocomplete="list"/.test(source)) searchableComboboxes.push(relative);
    if (/type="search"/.test(source)) searchInputs.push(relative);
  });

  assert.ok(searchableComboboxes.length >= 3, `Expected searchable comboboxes, found ${searchableComboboxes.length}`);
  assert.ok(searchInputs.length >= 8, `Expected site search inputs, found ${searchInputs.length}`);

  const script = read('public/js/search-clear-controls.js');
  assert.match(script, /input\[type="search"\]:not\(\[data-search-clear-exempt\]\)/);
  assert.match(script, /input\[role="combobox"\]\[aria-autocomplete="list"\]:not\(\[data-search-clear-exempt\]\)/);
});

test('existing searchable components already clear their authoritative hidden selections on input', () => {
  const techForm = read('public/js/tech-unit-form.js');
  const techUnits = read('public/js/tech-units.js');
  const requirements = read('public/js/lot-requirements.js');

  assert.match(techForm, /assignableLotComboboxInput[\s\S]*clearAssignableLotSelection\(form\)/);
  assert.match(techForm, /modelComboboxInput[\s\S]*selectionInput\.value = ''/);
  assert.match(techForm, /processorComboboxInput[\s\S]*selectionInput\.value = ''/);
  assert.match(techUnits, /if \(!input\.value\.trim\(\)\)[\s\S]*valueInput\.value = ''/);
  assert.match(requirements, /searchInput\.addEventListener\('input'[\s\S]*selectInput\.value = ''/);
});
