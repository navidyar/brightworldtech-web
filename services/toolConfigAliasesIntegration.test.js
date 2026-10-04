'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Tool alias management reuses configuration.values.manage and is exposed per system-used category', () => {
  const routes = read('routes/config.js');
  const page = read('views/pages/management-config.ejs');
  assert.match(routes, /categories\/:configCategoryId\/tool-aliases\/modal[\s\S]*?requirePermission\('configuration\.values\.manage'\)/);
  assert.match(routes, /categories\/:configCategoryId\/tool-aliases'[\s\S]*?requirePermission\('configuration\.values\.manage'\)/);
  assert.match(routes, /categories\/:configCategoryId\/tool-aliases\/:aliasId\/delete[\s\S]*?requirePermission\('configuration\.values\.manage'\)/);
  assert.match(page, /isSystemUsedCategory\(category\)[\s\S]*?Tool Aliases/);
  assert.doesNotMatch(read('config/permissionCatalog.js'), /tool.*alias.*manage/i);
});

test('Tool Configuration API is authenticated with the existing Unit API access gate', () => {
  const routes = read('routes/api.js');
  const service = read('services/apiToolConfiguration.js');
  assert.match(routes, /router\.get\('\/tool-configuration', requireApiAuth, requireUnitApiAccess/);
  assert.match(service, /contract_version: 1/);
  assert.match(service, /configuration_version/);
  assert.match(service, /categories/);
  assert.match(service, /aliases/);
});

test('shared config resolution prefers current active values and then category-scoped aliases', () => {
  const resolver = read('services/apiConfigValueResolver.js');
  assert.match(resolver, /listActiveSystemCategoryAliases/);
  assert.match(resolver, /resolutionSource: 'configured_value'/);
  assert.match(resolver, /resolutionSource: 'tool_alias'/);
  assert.match(resolver, /target\.config_category_id = a\.config_category_id/);
});

test('Memory, Storage, OS, Graphics and Display consume the generic alias layer', () => {
  for (const file of [
    'services/apiMemoryInventory.js',
    'services/apiStorageInventory.js',
    'services/apiCatalogInventory.js',
    'services/apiGraphicsDisplayInventory.js'
  ]) {
    assert.match(read(file), /listActiveSystemCategoryAliases/, file);
  }
  const storage = read('services/apiStorageInventory.js');
  assert.doesNotMatch(storage, /m2sata.*sata/);
  assert.doesNotMatch(storage, /nvmexpress.*nvme/);
  assert.doesNotMatch(read('services/apiScalarInventory.js'), /keyboardLanguageAliases/);
});

test('renaming an active system config value automatically preserves its old vocabulary as Tool aliases', () => {
  const controller = read('controllers/configController.js');
  const model = read('models/toolConfigAliasModel.js');
  assert.match(controller, /preserveRenamedValueAliases/);
  assert.match(controller, /previousLabel: configValue\.label/);
  assert.match(controller, /previousValue: configValue\.value/);
  assert.match(model, /async function preserveRenamedValueAliases/);
});

test('LPDDR canonical values are deleted while raw LPDDR observations are seeded as DDR aliases', () => {
  const migration = read('scripts/migrateToolConfigAliases.js');
  assert.match(migration, /LPDDR4'.*'ddr4'/);
  assert.match(migration, /LPDDR4X'.*'ddr4'/);
  assert.match(migration, /LPDDR5'.*'ddr5'/);
  assert.match(migration, /LPDDR5X'.*'ddr5'/);
  assert.match(migration, /\[56,54\]/);
  assert.match(migration, /\[57,55\]/);
  assert.match(migration, /DELETE FROM config_values WHERE config_value_id=\?/);
});
