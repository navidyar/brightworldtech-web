'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const registry = require('../config/configIdentityRegistry');

const root = path.resolve(__dirname, '..');

test('productivity types use stable numeric system identities', () => {
  assert.equal(registry.SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTIVITY_TYPES, 47);
  assert.equal(registry.SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_FULL_UNIT, 611);
  assert.equal(registry.SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_SUPPORT, 612);
  assert.equal(registry.SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_QC, 613);
  const bindings = registry.VALUE_BINDINGS.filter(
    (binding) => binding.categorySystemId === registry.SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTIVITY_TYPES
  );
  assert.deepEqual(bindings.map((binding) => binding.systemId), [611, 612, 613]);
});

test('productivity view repair is guarded, dry-run by default, and removes code-column dependence', () => {
  const migration = fs.readFileSync(path.join(root, 'scripts/migrateProductivityViewFoundation.js'), 'utf8');
  const systemModel = fs.readFileSync(path.join(root, 'models/systemModel.js'), 'utf8');
  const systemController = fs.readFileSync(path.join(root, 'controllers/systemController.js'), 'utf8');

  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /configCategoryId: 17/);
  assert.match(migration, /configValueId: 84/);
  assert.match(migration, /configValueId: 85/);
  assert.match(migration, /configValueId: 86/);
  assert.match(migration, /LEFT JOIN system_config_values type_system/);
  assert.doesNotMatch(migration, /pt\.code/);
  assert.match(systemModel, /invalidViews/);
  assert.match(systemController, /invalidViews/);
});
