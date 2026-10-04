const { pool } = require('./db');
const { normalizeTimeZone } = require('../utils/timeZone');

const SETTINGS_ID = 1;
const CACHE_TTL_MS = 60 * 1000;
const FALLBACK_DEFAULT_TIME_ZONE = 'UTC';
const DEFAULT_HUDDLE_ARCHIVE_DAYS = 30;
const MIN_HUDDLE_ARCHIVE_DAYS = 1;
const MAX_HUDDLE_ARCHIVE_DAYS = 3650;

let cachedSettings = null;
let cacheExpiresAt = 0;

function normalizeHuddleArchiveDays(value, fallback = DEFAULT_HUDDLE_ARCHIVE_DAYS) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= MIN_HUDDLE_ARCHIVE_DAYS && parsed <= MAX_HUDDLE_ARCHIVE_DAYS
    ? parsed
    : fallback;
}

function normalizeSettings(row = {}) {
  return {
    defaultTimeZone: normalizeTimeZone(row.default_time_zone || row.defaultTimeZone, FALLBACK_DEFAULT_TIME_ZONE),
    huddleArchiveDays: normalizeHuddleArchiveDays(row.huddle_archive_days ?? row.huddleArchiveDays)
  };
}

function setCachedApplicationSettings(settings) {
  cachedSettings = normalizeSettings(settings);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedSettings;
}

async function getApplicationSettings(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && cachedSettings && now < cacheExpiresAt) return cachedSettings;

  try {
    const [rows] = await pool.query(
      `SELECT default_time_zone, huddle_archive_days
       FROM application_settings
       WHERE application_settings_id = ?
       LIMIT 1`,
      [SETTINGS_ID]
    );

    return setCachedApplicationSettings(rows[0] || {
      default_time_zone: FALLBACK_DEFAULT_TIME_ZONE,
      huddle_archive_days: DEFAULT_HUDDLE_ARCHIVE_DAYS
    });
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR' || Number(error?.errno) === 1054) {
      const [rows] = await pool.query(
        `SELECT default_time_zone
         FROM application_settings
         WHERE application_settings_id = ?
         LIMIT 1`,
        [SETTINGS_ID]
      );
      return setCachedApplicationSettings({
        ...(rows[0] || { default_time_zone: FALLBACK_DEFAULT_TIME_ZONE }),
        huddle_archive_days: DEFAULT_HUDDLE_ARCHIVE_DAYS
      });
    }
    if (error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146) {
      return setCachedApplicationSettings({
        default_time_zone: FALLBACK_DEFAULT_TIME_ZONE,
        huddle_archive_days: DEFAULT_HUDDLE_ARCHIVE_DAYS
      });
    }
    throw error;
  }
}

async function updateDefaultTimeZone({ defaultTimeZone, updatedByUserId = null }) {
  const normalizedTimeZone = normalizeTimeZone(defaultTimeZone, null);
  if (!normalizedTimeZone) {
    const error = new Error('Choose a valid IANA time zone.');
    error.code = 'INVALID_TIME_ZONE';
    throw error;
  }

  await pool.query(
    `UPDATE application_settings
     SET default_time_zone = ?, updated_by_user_id = ?, updated_at = UTC_TIMESTAMP()
     WHERE application_settings_id = ?`,
    [normalizedTimeZone, updatedByUserId || null, SETTINGS_ID]
  );

  return getApplicationSettings({ forceRefresh: true });
}

async function updateHuddleArchiveDays({ huddleArchiveDays, updatedByUserId = null }) {
  const normalizedDays = normalizeHuddleArchiveDays(huddleArchiveDays, null);
  if (!normalizedDays) {
    const error = new Error(`Huddle archive timing must be between ${MIN_HUDDLE_ARCHIVE_DAYS} and ${MAX_HUDDLE_ARCHIVE_DAYS} days.`);
    error.code = 'INVALID_HUDDLE_ARCHIVE_DAYS';
    throw error;
  }

  await pool.query(
    `UPDATE application_settings
     SET huddle_archive_days = ?, updated_by_user_id = ?, updated_at = UTC_TIMESTAMP()
     WHERE application_settings_id = ?`,
    [normalizedDays, updatedByUserId || null, SETTINGS_ID]
  );

  return getApplicationSettings({ forceRefresh: true });
}

module.exports = {
  DEFAULT_HUDDLE_ARCHIVE_DAYS,
  FALLBACK_DEFAULT_TIME_ZONE,
  MAX_HUDDLE_ARCHIVE_DAYS,
  MIN_HUDDLE_ARCHIVE_DAYS,
  getApplicationSettings,
  normalizeHuddleArchiveDays,
  updateDefaultTimeZone,
  updateHuddleArchiveDays,
  setCachedApplicationSettings
};
