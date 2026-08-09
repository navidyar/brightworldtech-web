'use strict';

const ALLOWED_REFRESH_INTERVAL_MINUTES = Object.freeze([60, 120, 360, 1440]);
const DEFAULT_REFRESH_INTERVAL_MINUTES = 120;

const POPULARITY_SELECTOR_DEFINITIONS = Object.freeze([
  { key: 'unit_category', label: 'Unit Category', optionScope: 'unit_category', contextScope: 'global', contextLabel: 'Global' },
  { key: 'manufacturer', label: 'Manufacturer', optionScope: 'manufacturer', contextScope: 'global', contextLabel: 'Global' },
  { key: 'unit_model', label: 'Unit Model', optionScope: 'unit_model', contextScope: 'manufacturer', contextLabel: 'Manufacturer' },
  { key: 'processor_brand', label: 'Processor Brand / Type', optionScope: 'processor_brand', contextScope: 'unit_model', contextLabel: 'Unit Model' },
  { key: 'processor_model', label: 'Processor', optionScope: 'processor_model', contextScope: 'unit_model', contextLabel: 'Unit Model' },
  { key: 'ram_type', label: 'Memory Type', optionScope: 'ram_type', contextScope: 'global', contextLabel: 'Global' },
  { key: 'memory_install_type', label: 'Memory Install Type', optionScope: 'memory_install_type', contextScope: 'global', contextLabel: 'Global' },
  { key: 'storage_type', label: 'Storage Type', optionScope: 'storage_type', contextScope: 'global', contextLabel: 'Global' },
  { key: 'storage_wipe_status', label: 'Storage Wipe Status', optionScope: 'storage_wipe_status', contextScope: 'global', contextLabel: 'Global' },
  { key: 'operating_system', label: 'Operating System', optionScope: 'operating_system', contextScope: 'global', contextLabel: 'Global' },
  { key: 'keyboard_language', label: 'Keyboard Language', optionScope: 'keyboard_language', contextScope: 'global', contextLabel: 'Global' },
  { key: 'gpu_type', label: 'GPU Type', optionScope: 'gpu_type', contextScope: 'global', contextLabel: 'Global' },
  { key: 'cosmetic_issue_type', label: 'Cosmetic Issue', optionScope: 'cosmetic_issue_type', contextScope: 'global', contextLabel: 'Global' },
  { key: 'hardware_issue_type', label: 'Hardware Issue', optionScope: 'hardware_issue_type', contextScope: 'global', contextLabel: 'Global' },
  { key: 'issue_location', label: 'Issue Location', optionScope: 'issue_location', contextScope: 'global', contextLabel: 'Global' }
]);

function parseAllowedRefreshIntervalMinutes(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);

  return ALLOWED_REFRESH_INTERVAL_MINUTES.includes(parsed) ? parsed : null;
}

function normalizeRefreshIntervalMinutes(value, fallback = DEFAULT_REFRESH_INTERVAL_MINUTES) {
  return parseAllowedRefreshIntervalMinutes(value)
    || parseAllowedRefreshIntervalMinutes(fallback)
    || DEFAULT_REFRESH_INTERVAL_MINUTES;
}

function formatRefreshIntervalLabel(minutes) {
  const normalizedMinutes = normalizeRefreshIntervalMinutes(minutes);

  if (normalizedMinutes === 60) {
    return 'Every hour';
  }

  if (normalizedMinutes === 1440) {
    return 'Once daily';
  }

  return `Every ${normalizedMinutes / 60} hours`;
}

function formatRelativeTime(value, now = new Date()) {
  if (!value) {
    return 'Not refreshed yet';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Refresh time unavailable';
  }

  const differenceMs = Math.max(0, now.getTime() - date.getTime());
  const differenceMinutes = Math.floor(differenceMs / 60000);

  if (differenceMinutes < 1) {
    return 'Just now';
  }

  if (differenceMinutes < 60) {
    return `${differenceMinutes} minute${differenceMinutes === 1 ? '' : 's'} ago`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);

  if (differenceHours < 24) {
    return `${differenceHours} hour${differenceHours === 1 ? '' : 's'} ago`;
  }

  const differenceDays = Math.floor(differenceHours / 24);
  return `${differenceDays} day${differenceDays === 1 ? '' : 's'} ago`;
}

function normalizeScopeSummaryRows(rows = []) {
  const summaryByKey = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const optionScope = String(row.option_scope ?? row.optionScope ?? '').trim();
    const contextScope = String(row.context_scope ?? row.contextScope ?? 'global').trim() || 'global';

    if (!optionScope) {
      return;
    }

    summaryByKey.set(`${optionScope}::${contextScope}`, {
      cachedValueCount: Number(row.cached_value_count ?? row.cachedValueCount ?? 0) || 0,
      rankingRowCount: Number(row.ranking_row_count ?? row.rankingRowCount ?? 0) || 0,
      contextCount: Number(row.context_count ?? row.contextCount ?? 0) || 0
    });
  });

  return summaryByKey;
}

function buildPopularityRows(scopeSummaryRows = []) {
  const summaryByKey = normalizeScopeSummaryRows(scopeSummaryRows);

  return POPULARITY_SELECTOR_DEFINITIONS.map((definition) => {
    const summary = summaryByKey.get(`${definition.optionScope}::${definition.contextScope}`) || {
      cachedValueCount: 0,
      rankingRowCount: 0,
      contextCount: 0
    };

    return {
      key: definition.key,
      label: definition.label,
      sortingLabel: 'Popularity',
      contextLabel: definition.contextLabel,
      cachedValueCount: summary.cachedValueCount,
      rankingRowCount: summary.rankingRowCount,
      contextCount: summary.contextCount,
      isPopularitySorted: true
    };
  });
}

function buildManualRows(categories = []) {
  return (Array.isArray(categories) ? categories : [])
    .filter((category) => !category.usesPopularitySorting)
    .map((category) => ({
      key: `config-category-${category.config_category_id}`,
      label: category.label || category.code,
      sortingLabel: 'Manual',
      contextLabel: category.supportsDragOrdering ? 'Drag ordered' : 'Configured order',
      cachedValueCount: null,
      rankingRowCount: null,
      contextCount: null,
      isPopularitySorted: false
    }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, {
      numeric: true,
      sensitivity: 'base'
    }));
}

function getHealthPresentation(state = null, now = new Date(), refreshMinutes = DEFAULT_REFRESH_INTERVAL_MINUTES) {
  if (!state) {
    return {
      key: 'unavailable',
      label: 'Unavailable',
      description: 'The ranking cache storage is not ready.',
      isHealthy: false,
      isRunning: false,
      isFailed: false,
      isDue: false
    };
  }

  const status = String(state.status || 'idle').toLowerCase();
  const completedAt = state.completed_at ? new Date(state.completed_at) : null;
  const nextRefreshAt = completedAt && !Number.isNaN(completedAt.getTime())
    ? new Date(completedAt.getTime() + (refreshMinutes * 60 * 1000))
    : null;
  const isDue = Boolean(nextRefreshAt && now.getTime() >= nextRefreshAt.getTime());

  if (status === 'running') {
    return {
      key: 'running',
      label: 'Refreshing',
      description: 'A fresh ranking cache is being calculated. The previous cache remains active.',
      isHealthy: true,
      isRunning: true,
      isFailed: false,
      isDue
    };
  }

  if (status === 'failed') {
    return {
      key: 'failed',
      label: 'Refresh failed',
      description: 'The previous successful rankings remain active.',
      isHealthy: false,
      isRunning: false,
      isFailed: true,
      isDue
    };
  }

  if (!completedAt) {
    return {
      key: 'waiting',
      label: 'Waiting for first refresh',
      description: 'Run the first refresh to populate operational list rankings.',
      isHealthy: false,
      isRunning: false,
      isFailed: false,
      isDue: true
    };
  }

  if (isDue) {
    return {
      key: 'due',
      label: 'Refresh due',
      description: 'The scheduler will refresh the cache on its next check.',
      isHealthy: true,
      isRunning: false,
      isFailed: false,
      isDue: true
    };
  }

  return {
    key: 'healthy',
    label: 'Healthy',
    description: 'Operational selectors are reading from the latest successful cache.',
    isHealthy: true,
    isRunning: false,
    isFailed: false,
    isDue: false
  };
}

function buildOperationalOptionRankingAdministration({
  refreshState = null,
  scopeSummaryRows = [],
  categories = [],
  refreshMinutes = DEFAULT_REFRESH_INTERVAL_MINUTES,
  now = new Date(),
  message = null,
  messageType = 'success',
  detailsOpen = false
} = {}) {
  const normalizedRefreshMinutes = normalizeRefreshIntervalMinutes(refreshMinutes);
  const completedAt = refreshState?.completed_at ? new Date(refreshState.completed_at) : null;
  const nextRefreshAt = completedAt && !Number.isNaN(completedAt.getTime())
    ? new Date(completedAt.getTime() + (normalizedRefreshMinutes * 60 * 1000))
    : null;
  const popularityRows = buildPopularityRows(scopeSummaryRows);
  const manualRows = buildManualRows(categories);
  const health = getHealthPresentation(refreshState, now, normalizedRefreshMinutes);
  const rankingRowCount = Number(refreshState?.ranking_row_count || 0);
  const durationMs = Number(refreshState?.duration_ms || 0);

  return {
    supported: Boolean(refreshState),
    health,
    refreshMinutes: normalizedRefreshMinutes,
    refreshIntervalLabel: formatRefreshIntervalLabel(normalizedRefreshMinutes),
    allowedRefreshIntervals: ALLOWED_REFRESH_INTERVAL_MINUTES.map((minutes) => ({
      minutes,
      label: formatRefreshIntervalLabel(minutes)
    })),
    completedAt,
    completedAtRelative: formatRelativeTime(completedAt, now),
    nextRefreshAt,
    rankingRowCount,
    durationMs,
    lastError: refreshState?.last_error || '',
    popularityRows,
    manualRows,
    allRows: [...popularityRows, ...manualRows],
    message,
    messageType,
    detailsOpen: Boolean(detailsOpen)
  };
}

module.exports = {
  ALLOWED_REFRESH_INTERVAL_MINUTES,
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  POPULARITY_SELECTOR_DEFINITIONS,
  buildManualRows,
  buildOperationalOptionRankingAdministration,
  buildPopularityRows,
  formatRefreshIntervalLabel,
  formatRelativeTime,
  getHealthPresentation,
  normalizeRefreshIntervalMinutes,
  parseAllowedRefreshIntervalMinutes
};
