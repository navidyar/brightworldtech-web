const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('unit completion preview uses the actual lot_name returned by the Lot catalog', () => {
  const source = read('models/techUnitModel.js');

  assert.match(
    source,
    /lotName:\s*lot\.lot_name\s*\|\|\s*lot\.name\s*\|\|\s*'Current lot'/,
    'completion preview should prefer the canonical lot_name field from lotModel.listLots()'
  );

  const oldWrongUses = source.match(/lotName:\s*lot\.name\s*\|\|\s*'Current lot'/g) || [];
  assert.equal(oldWrongUses.length, 0, 'completion preview should not rely only on the non-existent lot.name alias');
});

test('completion modal renders preview lotName for Current Lot', () => {
  const modal = read('views/fragments/tech-unit-complete-work-modal.ejs');

  assert.match(modal, /<dt>Current Lot<\/dt>[\s\S]*?<dd><%= safePreview\.lotName \|\| '—' %><\/dd>/);
});
