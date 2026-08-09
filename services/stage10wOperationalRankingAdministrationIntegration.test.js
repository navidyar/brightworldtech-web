'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 10W migration adds a constrained database-backed refresh interval without replacing ranking tables', () => {
  const migration = read('sql/2026-08-stage-10w-operational-option-ranking-administration.sql');
  const applyScript = read('scripts/apply-stage-10w-operational-ranking-administration.sh');

  assert.match(migration, /Stage 10W requires the Stage 10M operational option refresh-state table/);
  assert.match(migration, /ADD COLUMN refresh_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120/);
  assert.match(migration, /MODIFY COLUMN refresh_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120/);
  assert.match(migration, /DROP CHECK chk_operational_option_refresh_interval/);
  assert.match(migration, /refusing destructive replacement/);
  assert.match(migration, /CHECK \(refresh_interval_minutes IN \(60, 120, 360, 1440\)\)/);
  assert.doesNotMatch(migration, /DROP TABLE operational_option_usage/);
  assert.match(applyScript, /Stage 10W operational ranking administration migration verified complete/);
  assert.match(applyScript, /expected 1:1:1/);
});

test('Configuration exposes Admin-only ranking refresh and interval endpoints', () => {
  const routes = read('routes/config.js');
  const controller = read('controllers/configController.js');

  assert.match(routes, /\/management\/config\/operational-rankings\/refresh/);
  assert.match(routes, /\/management\/config\/operational-rankings\/interval/);
  assert.match(routes, /requireRole\(configRoles\)[\s\S]*configController\.refreshOperationalOptionRankings/);
  assert.match(routes, /requireRole\(configRoles\)[\s\S]*configController\.updateOperationalOptionRankingInterval/);
  assert.match(controller, /loadOperationalRankingAdministration/);
  assert.match(controller, /renderOperationalRankingAdministration/);
  assert.match(controller, /previous successful rankings remain active/i);
});

test('Configuration renders one compact ranking summary with expandable operational and manual ordering details', () => {
  const page = read('views/pages/management-config.ejs');
  const fragment = read('views/fragments/operational-option-ranking-administration.ejs');

  assert.match(page, /operational-option-ranking-administration/);
  assert.match(fragment, /Operational List Sorting/);
  assert.match(fragment, /Refresh Now/);
  assert.match(fragment, /Refresh interval/);
  assert.match(fragment, /View Details/);
  assert.match(fragment, /Popularity-sorted operational selectors/);
  assert.match(fragment, /Configuration-managed lists/);
  assert.match(fragment, /Previous successful cache remains active/);
  assert.match(fragment, /hx-target="#operational-ranking-administration"/);
  assert.doesNotMatch(fragment, /Pin near top|Exclude from popularity/);
});

test('scheduler reads the database-backed interval and polls safely without slowing form requests', () => {
  const model = read('models/operationalOptionRankingModel.js');
  const server = read('server.js');

  assert.match(model, /getConfiguredRefreshMinutes/);
  assert.match(model, /setConfiguredRefreshMinutes/);
  assert.match(model, /SELECT refresh_key[\s\S]*WHERE refresh_key = 'operational_options'/);
  assert.doesNotMatch(model, /affectedRows[\s\S]*OPERATIONAL_RANKING_STATE_MISSING/);
  assert.match(model, /SCHEDULER_POLL_MINUTES = 15/);
  assert.match(model, /refreshOperationalOptionUsageRankingsIfStale\(\)/);
  assert.match(model, /pollIntervalMs/);
  assert.match(model, /COUNT\(DISTINCT option_key\) AS cached_value_count/);
  assert.match(server, /scheduleOperationalOptionUsageRankingRefresh\(\)/);
  assert.doesNotMatch(read('views/fragments/tech-unit-form.ejs'), /refreshOperationalOptionUsageRankings/);
});

test('running and failed refresh state updates preserve the last successful cache measurements', () => {
  const model = read('models/operationalOptionRankingModel.js');

  assert.match(model, /WHEN VALUES\(status\) = 'complete' THEN VALUES\(completed_at\)[\s\S]*ELSE completed_at/);
  assert.match(model, /WHEN VALUES\(status\) = 'complete' THEN VALUES\(duration_ms\)[\s\S]*ELSE duration_ms/);
  assert.match(model, /WHEN VALUES\(status\) = 'complete' THEN VALUES\(ranking_row_count\)[\s\S]*ELSE ranking_row_count/);
  assert.match(model, /DELETE FROM \$\{escapeIdentifier\(RANKING_TABLE\)\}/);
  assert.match(model, /await connection\.commit\(\)/);
  assert.match(model, /await connection\.rollback\(\)/);
});

test('shared Configuration styling remains compact, responsive, and uses common table headers', () => {
  const css = read('public/css/app.css');
  const fragment = read('views/fragments/operational-option-ranking-administration.ejs');
  const head = read('views/partials/head.ejs');

  assert.match(css, /\.operational-ranking-summary/);
  assert.match(css, /\.operational-ranking-controls/);
  assert.match(css, /\.operational-ranking-facts/);
  assert.match(css, /\.operational-ranking-table-group-row th/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(fragment, /class="table-card operational-ranking-table"/);
  assert.match(head, /app\.css\?v=20260804-stage10w-ranking-administration/);
  assert.match(read('views/pages/management-config.ejs'), /config-values\.js\?v=20260804-stage10w-ranking-administration/);
});

test('Stage 10W provides focused apply, status, and validation commands', () => {
  const packageJson = read('package.json');
  const validationScript = read('scripts/runStage10wOperationalRankingAdministrationValidation.sh');
  const checkScript = read('scripts/check-stage-10w-operational-ranking-administration.sh');

  assert.match(packageJson, /validate:operational-ranking-administration/);
  assert.match(validationScript, /operationalOptionRankingAdministration\.test\.js/);
  assert.match(validationScript, /validateStage10wOperationalRankingAdministration\.js/);
  assert.match(checkScript, /refresh_interval_minutes/);
  assert.match(checkScript, /cached_values/);
});
