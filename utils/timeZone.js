const FALLBACK_TIME_ZONE = 'UTC';

function isValidTimeZone(value) {
  const timeZone = String(value || '').trim();
  if (!timeZone) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}

function normalizeTimeZone(value, fallback = FALLBACK_TIME_ZONE) {
  const timeZone = String(value || '').trim();
  if (isValidTimeZone(timeZone)) return timeZone;
  return fallback && isValidTimeZone(fallback) ? fallback : null;
}


function listSupportedTimeZones() {
  if (typeof Intl.supportedValuesOf !== 'function') {
    return [FALLBACK_TIME_ZONE];
  }

  const supported = Intl.supportedValuesOf('timeZone')
    .filter((timeZone) => isValidTimeZone(timeZone));

  return Array.from(new Set([FALLBACK_TIME_ZONE, ...supported]))
    .sort((left, right) => {
      if (left === FALLBACK_TIME_ZONE) return -1;
      if (right === FALLBACK_TIME_ZONE) return 1;
      return left.localeCompare(right);
    });
}

function formatDateParts(date, timeZone = FALLBACK_TIME_ZONE) {
  const safeTimeZone = normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => ['year', 'month', 'day'].includes(part.type))
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function formatDateKey(date, timeZone = FALLBACK_TIME_ZONE) {
  const { year, month, day } = formatDateParts(date, timeZone);

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getTimeZoneOffsetMilliseconds(date, timeZone = FALLBACK_TIME_ZONE) {
  const safeTimeZone = normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone,
    timeZoneName: 'longOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const timeZoneName = parts.find((part) => part.type === 'timeZoneName')?.value || '';
  if (timeZoneName === 'GMT') return 0;

  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName);
  if (!match) throw new Error(`Unable to resolve time zone offset for ${safeTimeZone}.`);

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);

  return sign * ((hours * 60) + minutes) * 60 * 1000;
}

function formatUtcSqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid date is required for UTC SQL formatting.');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getDayStartUtc(dateKey, timeZone = FALLBACK_TIME_ZONE) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  const safeTimeZone = normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE);
  const localAsUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0);
  let utcDate = new Date(localAsUtc - getTimeZoneOffsetMilliseconds(new Date(localAsUtc), safeTimeZone));
  utcDate = new Date(localAsUtc - getTimeZoneOffsetMilliseconds(utcDate, safeTimeZone));
  return utcDate;
}

function getDayRangeUtc(dateKey, timeZone = FALLBACK_TIME_ZONE) {
  const startAt = getDayStartUtc(dateKey, timeZone);
  if (!startAt) return null;

  const parsed = parseDateKey(dateKey);
  const nextDayKey = formatDateKey(
    new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1, 12, 0, 0)),
    'UTC'
  );
  const endAt = getDayStartUtc(nextDayKey, timeZone);

  return { startAt, endAt };
}

module.exports = {
  FALLBACK_TIME_ZONE,
  isValidTimeZone,
  normalizeTimeZone,
  listSupportedTimeZones,
  formatDateKey,
  parseDateKey,
  formatUtcSqlDateTime,
  getDayRangeUtc
};
