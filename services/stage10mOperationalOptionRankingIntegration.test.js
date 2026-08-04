const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 10M migration safely creates the ranking cache and refresh state', () => {
  const migration = read('sql/2026-08-stage-10m-operational-option-usage-rankings.sql');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS operational_option_usage_rankings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS operational_option_usage_refresh_state/);
  assert.match(migration, /refusing destructive replacement/);
  assert.match(migration, /weighted_score BIGINT UNSIGNED/);
  assert.match(migration, /context_scope VARCHAR\(64\)/);
});

test('ranking refresh is cached, locked, measured, and scheduled outside page requests', () => {
  const model = read('models/operationalOptionRankingModel.js');
  const server = read('server.js');

  assert.match(model, /CONFIG_USAGE_RANKING_REFRESH_MINUTES/);
  assert.match(model, /DEFAULT_REFRESH_MINUTES = 120/);
  assert.match(model, /GET_LOCK/);
  assert.match(model, /ranking_row_count/);
  assert.match(model, /durationMs/);
  assert.match(model, /SNAPSHOT_MEMORY_TTL_MS/);
  assert.match(model, /using canonical option order/);
  assert.match(server, /scheduleOperationalOptionUsageRankingRefresh\(\)/);
});

test('eligible operational selectors use popularity while semantic status lists keep fixed order', () => {
  const techModel = read('models/techUnitModel.js');
  const expandedModel = read('models/unitExpandedFormModel.js');
  const issueModel = read('models/unitIssueEntryModel.js');

  for (const scope of [
    'unit_category',
    'manufacturer',
    'unit_model',
    'processor_brand',
    'processor_model',
    'ram_type',
    'memory_install_type',
    'storage_type',
    'storage_wipe_status',
    'operating_system'
  ]) {
    assert.match(techModel, new RegExp(`optionScope: '${scope}'`));
  }

  assert.match(techModel, /rankedBrowserUnitCategories/);
  assert.match(expandedModel, /optionScope: 'keyboard_language'/);
  assert.match(expandedModel, /optionScope: 'gpu_type'/);
  assert.doesNotMatch(expandedModel, /optionScope: 'absolute_status'/);
  assert.doesNotMatch(expandedModel, /optionScope: 'diagnostics_status'/);
  assert.match(issueModel, /optionScope: 'cosmetic_issue_type'/);
  assert.match(issueModel, /optionScope: 'hardware_issue_type'/);
  assert.match(issueModel, /optionScope: 'issue_location'/);
  assert.doesNotMatch(issueModel, /optionScope: 'issue_severity'/);
});



test('Unit Model refresh remains compatible with MySQL ONLY_FULL_GROUP_BY', () => {
  const model = read('models/operationalOptionRankingModel.js');

  assert.match(model, /const contextGroupBySql = hasUnitManufacturer && hasModelManufacturer/);
  assert.match(model, /u\.unit_model_id, u\.manufacturer_id, um\.manufacturer_id/);
  assert.match(model, /groupBySql: contextGroupBySql/);
  assert.doesNotMatch(model, /groupBySql: `u\.unit_model_id, \$\{contextExpression\}`/);
});

test('Unit Model and Processor lists carry contextual cache scores into the existing comboboxes', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  const browser = read('public/js/tech-unit-form.js');

  assert.match(form, /data-usage-score/);
  assert.match(form, /data-context-usage-scores/);
  assert.match(browser, /getOperationalUsageScore/);
  assert.match(browser, /compareOperationalOptions/);
  assert.match(browser, /filters\.manufacturerId/);
  assert.match(browser, /modelSelectionInput\.value/);
  assert.match(read('views/pages/tech-unit-form.ejs'), /stage10q-hardware-none/);
  assert.match(read('views/pages/tech-units.ejs'), /stage10q-hardware-none/);
});

test('configuration administration order is not rewritten by the ranking service', () => {
  const configRoutes = read('routes/config.js');
  const rankingModel = read('models/operationalOptionRankingModel.js');

  assert.doesNotMatch(configRoutes, /operationalOptionRanking/);
  assert.doesNotMatch(rankingModel, /UPDATE\s+config_values/i);
  assert.doesNotMatch(rankingModel, /UPDATE\s+unit_models/i);
});
