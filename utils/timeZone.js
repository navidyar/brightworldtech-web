const APP_DISPLAY_TIME_ZONE = 'America/Chicago';

function formatDateParts(date, timeZone = APP_DISPLAY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
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

function formatDateKey(date, timeZone = APP_DISPLAY_TIME_ZONE) {
  const { year, month, day } = formatDateParts(date, timeZone);

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());

  if (!match) {
    return null;
  }

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

function getTimeZoneOffsetMilliseconds(date, timeZone = APP_DISPLAY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
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
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName);

  if (!match) {
    throw new Error(`Unable to resolve time zone offset for ${timeZone}.`);
  }

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);

  return sign * ((hours * 60) + minutes) * 60 * 1000;
}

function getDayStartUtc(dateKey, timeZone = APP_DISPLAY_TIME_ZONE) {
  const parsed = parseDateKey(dateKey);

  if (!parsed) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0));
  const offsetMilliseconds = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offsetMilliseconds);
}

function getDayRangeUtc(dateKey, timeZone = APP_DISPLAY_TIME_ZONE) {
  const startAt = getDayStartUtc(dateKey, timeZone);

  if (!startAt) {
    return null;
  }

  const parsed = parseDateKey(dateKey);
  const nextDayKey = formatDateKey(
    new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1, 12, 0, 0)),
    'UTC'
  );
  const endAt = getDayStartUtc(nextDayKey, timeZone);

  return {
    startAt,
    endAt
  };
}

module.exports = {
  APP_DISPLAY_TIME_ZONE,
  formatDateKey,
  parseDateKey,
  getDayRangeUtc
};
