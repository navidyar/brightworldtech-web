'use strict';

const { pool } = require('../models/db');
const operationalOptionRankingModel = require('../models/operationalOptionRankingModel');
const {
  ALLOWED_REFRESH_INTERVAL_MINUTES
} = require('../services/operationalOptionRankingAdministration');

async function scalar(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  const value = rows[0] ? Object.values(rows[0])[0] : null;

  return Number(value || 0);
}

async function main() {
  const requiredColumnCount = await scalar(`
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_refresh_state'
      AND COLUMN_NAME = 'refresh_interval_minutes'
      AND DATA_TYPE = 'smallint'
      AND COLUMN_TYPE = 'smallint unsigned'
      AND IS_NULLABLE = 'NO'
      AND COLUMN_DEFAULT = '120'
  `);
  const intervalConstraintCount = await scalar(`
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_refresh_state'
      AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME = 'chk_operational_option_refresh_interval'
  `);

  if (requiredColumnCount !== 1 || intervalConstraintCount !== 1) {
    throw new Error(`Stage 10W schema incomplete: interval column ${requiredColumnCount}/1, constraint ${intervalConstraintCount}/1.`);
  }

  const state = await operationalOptionRankingModel.getRefreshState();

  if (!state) {
    throw new Error('Stage 10W refresh state row is missing.');
  }

  const refreshMinutes = Number(state.refresh_interval_minutes || 0);

  if (!ALLOWED_REFRESH_INTERVAL_MINUTES.includes(refreshMinutes)) {
    throw new Error(`Unexpected Stage 10W refresh interval: ${refreshMinutes}.`);
  }

  const scopeSummaries = await operationalOptionRankingModel.listRankingScopeSummaries();

  if (scopeSummaries.length === 0 && Number(state.ranking_row_count || 0) > 0) {
    throw new Error('Stage 10W ranking scope summaries are unexpectedly empty.');
  }

  console.log(
    `Stage 10W ranking administration valid: ${refreshMinutes} minute interval, `
      + `${state.status} status, ${Number(state.ranking_row_count || 0)} cached ranking row(s), `
      + `${scopeSummaries.length} scope/context summary row(s).`
  );
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
