'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALLOWED_REFRESH_INTERVAL_MINUTES,
  POPULARITY_SELECTOR_DEFINITIONS,
  buildOperationalOptionRankingAdministration,
  buildManualRows,
  buildPopularityRows,
  formatRefreshIntervalLabel,
  formatRelativeTime,
  getHealthPresentation,
  normalizeRefreshIntervalMinutes,
  parseAllowedRefreshIntervalMinutes
} = require('./operationalOptionRankingAdministration');

test('Stage 10W accepts only the supported administrator refresh intervals', () => {
  assert.deepEqual(ALLOWED_REFRESH_INTERVAL_MINUTES, [60, 120, 360, 1440]);
  assert.equal(parseAllowedRefreshIntervalMinutes('60'), 60);
  assert.equal(parseAllowedRefreshIntervalMinutes(1440), 1440);
  assert.equal(parseAllowedRefreshIntervalMinutes('15'), null);
  assert.equal(parseAllowedRefreshIntervalMinutes('abc'), null);
  assert.equal(normalizeRefreshIntervalMinutes('invalid'), 120);
  assert.equal(formatRefreshIntervalLabel(60), 'Every hour');
  assert.equal(formatRefreshIntervalLabel(120), 'Every 2 hours');
  assert.equal(formatRefreshIntervalLabel(360), 'Every 6 hours');
  assert.equal(formatRefreshIntervalLabel(1440), 'Once daily');
});

test('popularity administration covers every operational selector currently ranked', () => {
  const scopes = POPULARITY_SELECTOR_DEFINITIONS.map((definition) => definition.optionScope);

  assert.deepEqual(scopes, [
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
});

test('popularity rows use the intended contextual cache summary', () => {
  const rows = buildPopularityRows([
    {
      option_scope: 'unit_model',
      context_scope: 'manufacturer',
      cached_value_count: 84,
      ranking_row_count: 112,
      context_count: 19
    },
    {
      option_scope: 'unit_model',
      context_scope: 'global',
      cached_value_count: 999,
      ranking_row_count: 999,
      context_count: 1
    }
  ]);
  const unitModel = rows.find((row) => row.key === 'unit_model');

  assert.equal(unitModel.cachedValueCount, 84);
  assert.equal(unitModel.rankingRowCount, 112);
  assert.equal(unitModel.contextCount, 19);
  assert.equal(unitModel.contextLabel, 'Manufacturer');
});

test('manual rows distinguish drag ordering from configured fixed order', () => {
  const rows = buildManualRows([
    {
      config_category_id: 2,
      code: 'absolute_statuses',
      label: 'Absolute Status',
      usesPopularitySorting: false,
      supportsDragOrdering: true
    },
    {
      config_category_id: 1,
      code: 'yes_no',
      label: 'Yes / No',
      usesPopularitySorting: false,
      supportsDragOrdering: false
    },
    {
      config_category_id: 3,
      code: 'hardware_issue_types',
      label: 'Hardware Issue',
      usesPopularitySorting: true,
      supportsDragOrdering: false
    }
  ]);

  assert.deepEqual(rows.map((row) => [row.label, row.contextLabel]), [
    ['Absolute Status', 'Drag ordered'],
    ['Yes / No', 'Configured order']
  ]);
});

test('health presentation keeps previous cache available while refreshing or after failure', () => {
  const now = new Date('2026-08-04T17:00:00.000Z');
  const state = {
    completed_at: new Date('2026-08-04T16:30:00.000Z')
  };
  const running = getHealthPresentation({ ...state, status: 'running' }, now, 120);
  const failed = getHealthPresentation({ ...state, status: 'failed' }, now, 120);

  assert.equal(running.label, 'Refreshing');
  assert.equal(running.isHealthy, true);
  assert.match(running.description, /previous cache remains active/i);
  assert.equal(failed.label, 'Refresh failed');
  assert.equal(failed.isFailed, true);
  assert.match(failed.description, /previous successful rankings remain active/i);
});

test('healthy and due states are calculated from the last successful completion', () => {
  const now = new Date('2026-08-04T17:00:00.000Z');
  const healthy = getHealthPresentation({
    status: 'complete',
    completed_at: new Date('2026-08-04T16:30:00.000Z')
  }, now, 120);
  const due = getHealthPresentation({
    status: 'complete',
    completed_at: new Date('2026-08-04T14:30:00.000Z')
  }, now, 120);

  assert.equal(healthy.label, 'Healthy');
  assert.equal(healthy.isDue, false);
  assert.equal(due.label, 'Refresh due');
  assert.equal(due.isDue, true);
});

test('relative refresh copy remains compact', () => {
  const now = new Date('2026-08-04T17:00:00.000Z');

  assert.equal(formatRelativeTime(new Date('2026-08-04T16:59:40.000Z'), now), 'Just now');
  assert.equal(formatRelativeTime(new Date('2026-08-04T16:22:00.000Z'), now), '38 minutes ago');
  assert.equal(formatRelativeTime(new Date('2026-08-04T14:00:00.000Z'), now), '3 hours ago');
  assert.equal(formatRelativeTime(null, now), 'Not refreshed yet');
});

test('administration view model combines health, schedule, cache, and ordering rows', () => {
  const now = new Date('2026-08-04T17:00:00.000Z');
  const viewModel = buildOperationalOptionRankingAdministration({
    refreshState: {
      status: 'complete',
      completed_at: new Date('2026-08-04T16:30:00.000Z'),
      duration_ms: 74,
      ranking_row_count: 286,
      last_error: null
    },
    scopeSummaryRows: [
      {
        option_scope: 'manufacturer',
        context_scope: 'global',
        cached_value_count: 19,
        ranking_row_count: 19,
        context_count: 1
      }
    ],
    categories: [
      {
        config_category_id: 5,
        label: 'Absolute Status',
        usesPopularitySorting: false,
        supportsDragOrdering: true
      }
    ],
    refreshMinutes: 120,
    now,
    message: 'Saved.',
    detailsOpen: true
  });

  assert.equal(viewModel.health.label, 'Healthy');
  assert.equal(viewModel.completedAtRelative, '30 minutes ago');
  assert.equal(viewModel.rankingRowCount, 286);
  assert.equal(viewModel.durationMs, 74);
  assert.equal(viewModel.refreshIntervalLabel, 'Every 2 hours');
  assert.equal(viewModel.nextRefreshAt.toISOString(), '2026-08-04T18:30:00.000Z');
  assert.equal(viewModel.popularityRows.find((row) => row.key === 'manufacturer').cachedValueCount, 19);
  assert.equal(viewModel.manualRows[0].label, 'Absolute Status');
  assert.equal(viewModel.message, 'Saved.');
  assert.equal(viewModel.detailsOpen, true);
});
