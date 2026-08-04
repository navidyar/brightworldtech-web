require('dotenv').config();

const { pool } = require('../models/db');
const {
  getRefreshState,
  loadRankingSnapshot
} = require('../models/operationalOptionRankingModel');

const ELIGIBLE_SCOPES = new Set([
  'unit_category',
  'manufacturer',
  'unit_model',
  'processor_brand',
  'processor_model',
  'ram_type',
  'memory_install_type',
  'storage_type',
  'storage_wipe_status',
  'operating_system',
  'keyboard_language',
  'gpu_type',
  'cosmetic_issue_type',
  'hardware_issue_type',
  'issue_location'
]);

const EXCLUDED_SCOPES = new Set([
  'unit_status',
  'cosmetic_grade',
  'issue_severity',
  'outcome',
  'absolute_status',
  'diagnostics_status',
  'virus_check_status',
  'driver_check_status',
  'skinned_status'
]);

async function scalar(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  const value = rows[0] ? Object.values(rows[0])[0] : null;

  return Number(value || 0);
}

async function main() {
  const rankingColumns = await scalar(`
    SELECT COUNT(DISTINCT COLUMN_NAME)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_rankings'
      AND COLUMN_NAME IN (
        'option_scope', 'option_key', 'context_scope', 'context_key',
        'lifetime_count', 'count_90d', 'count_30d', 'weighted_score',
        'last_selected_at', 'refreshed_at'
      )
  `);
  const stateColumns = await scalar(`
    SELECT COUNT(DISTINCT COLUMN_NAME)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_refresh_state'
      AND COLUMN_NAME IN (
        'refresh_key', 'status', 'started_at', 'completed_at',
        'duration_ms', 'ranking_row_count', 'last_error', 'updated_at'
      )
  `);

  if (rankingColumns !== 10 || stateColumns !== 8) {
    throw new Error(`Stage 10M schema incomplete: ranking columns ${rankingColumns}/10, state columns ${stateColumns}/8.`);
  }

  const state = await getRefreshState();

  if (!state || state.status !== 'complete' || !state.completed_at) {
    throw new Error('Stage 10M ranking cache has not completed a successful refresh yet.');
  }

  const snapshot = await loadRankingSnapshot();
  const unknownScopes = snapshot.rows
    .map((row) => row.optionScope)
    .filter((scope) => !ELIGIBLE_SCOPES.has(scope));
  const excludedScopes = snapshot.rows
    .map((row) => row.optionScope)
    .filter((scope) => EXCLUDED_SCOPES.has(scope));
  const invalidScores = snapshot.rows.filter((row) => (
    row.weightedScore < row.lifetimeCount
    || row.count30d > row.count90d
    || row.count90d > row.lifetimeCount
  ));

  if (unknownScopes.length > 0) {
    throw new Error(`Unexpected operational ranking scopes: ${Array.from(new Set(unknownScopes)).join(', ')}`);
  }

  if (excludedScopes.length > 0) {
    throw new Error(`Semantic fixed-order scopes were ranked unexpectedly: ${Array.from(new Set(excludedScopes)).join(', ')}`);
  }

  if (invalidScores.length > 0) {
    throw new Error(`Stage 10M found ${invalidScores.length} invalid ranking score row(s).`);
  }

  console.log(
    `Stage 10M operational rankings valid: ${snapshot.size} ranking row(s), `
      + `${state.ranking_row_count || 0} refreshed in ${state.duration_ms || 0}ms.`
  );
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
