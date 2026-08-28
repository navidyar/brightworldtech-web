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

test('Unit Category, Unit Model, and Processor form options retain operational ranking integration', () => {
  const techModel = read('models/techUnitModel.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const browser = read('public/js/tech-unit-form.js');
  const formPage = read('views/pages/tech-unit-form.ejs');
  const browserPage = read('views/pages/tech-units.ejs');

  assert.match(techModel, /const rankedUnitCategories = sortOptionsByPopularity\(unitCategories, operationalRankingSnapshot, \{[\s\S]*?optionScope: 'unit_category'/);
  assert.match(techModel, /const unitCategoriesWithProductionWeights = rankedUnitCategories\.map/);
  assert.match(techModel, /unitCategories: unitCategoriesWithProductionWeights/);
  assert.match(form, /formOptions\.unitCategories\.forEach/);
  assert.match(form, /data-usage-score/);
  assert.match(form, /data-context-usage-scores/);
  assert.match(browser, /getOperationalUsageScore/);
  assert.match(browser, /compareOperationalOptions/);
  assert.match(browser, /filters\.manufacturerId/);
  assert.match(browser, /modelSelectionInput\.value/);
  assert.match(formPage, /tech-unit-form\.js\?v=[^\"']+/);
  assert.match(browserPage, /tech-unit-form\.js\?v=[^\"']+/);
});

test('configuration administration order is not rewritten by the ranking service', () => {
  const rankingModel = read('models/operationalOptionRankingModel.js');

  assert.doesNotMatch(rankingModel, /UPDATE\s+config_values/i);
  assert.doesNotMatch(rankingModel, /UPDATE\s+unit_models/i);
});
