'use strict';

const { pool } = require('./db');
const {
  DEFAULT_RECENT_PRINTS_MINUTES,
  DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES,
  normalizeLabelPrintSettings
} = require('../services/labelPrintSettingsPolicy');

const CACHE_TTL_MS = 30 * 1000;
let cachedSettings = null;
let cacheExpiresAt = 0;

function setCachedLabelPrintSettings(settings) {
  cachedSettings = normalizeLabelPrintSettings(settings);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedSettings;
}

function clearLabelPrintSettingsCache() {
  cachedSettings = null;
  cacheExpiresAt = 0;
}

async function getLabelPrintSettings(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && cachedSettings && now < cacheExpiresAt) return cachedSettings;

  try {
    const [rows] = await pool.query(
      `SELECT recent_prints_minutes, print_set_grouping_gap_minutes
       FROM label_print_settings
       WHERE label_print_settings_id = 1
       LIMIT 1`
    );
    const row = rows[0] || {};
    return setCachedLabelPrintSettings({
      recentPrintsMinutes: row.recent_prints_minutes,
      printSetGroupingGapMinutes: row.print_set_grouping_gap_minutes
    });
  } catch (error) {
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR')) {
      return setCachedLabelPrintSettings({
        recentPrintsMinutes: DEFAULT_RECENT_PRINTS_MINUTES,
        printSetGroupingGapMinutes: DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES
      });
    }
    throw error;
  }
}

async function updateLabelPrintSettings({ recentPrintsMinutes, printSetGroupingGapMinutes, updatedByUserId = null }) {
  const settings = normalizeLabelPrintSettings({ recentPrintsMinutes, printSetGroupingGapMinutes });
  await pool.query(
    `UPDATE label_print_settings
     SET recent_prints_minutes = ?, print_set_grouping_gap_minutes = ?, updated_by_user_id = ?
     WHERE label_print_settings_id = 1`,
    [settings.recentPrintsMinutes, settings.printSetGroupingGapMinutes, updatedByUserId || null]
  );
  return setCachedLabelPrintSettings(settings);
}

module.exports = {
  CACHE_TTL_MS,
  getLabelPrintSettings,
  updateLabelPrintSettings,
  setCachedLabelPrintSettings,
  clearLabelPrintSettingsCache
};
