'use strict';

const {
  APP_DISPLAY_TIME_ZONE,
  formatDateKey,
  getDayRangeUtc,
  parseDateKey
} = require('../utils/timeZone');

const REPORTING_PERIODS = Object.freeze([
  Object.freeze({ value: 'all_time', label: 'All Time' }),
  Object.freeze({ value: 'day', label: 'Day' }),
  Object.freeze({ value: 'work_week', label: 'Week' }),
  Object.freeze({ value: 'month', label: 'Month' }),
  Object.freeze({ value: 'month_to_date', label: 'Month-to-Date' }),
  Object.freeze({ value: 'custom_range', label: 'Range of Dates' })
]);

const VALID_PERIODS = new Set(REPORTING_PERIODS.map((period) => period.value));

class QcReportingScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QcReportingScopeError';
    this.code = 'BWT_QC_REPORTING_SCOPE_INVALID';
  }
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTechnicianIds(value, allowedIds = []) {
  const values = Array.isArray(value) ? value : [value];
  const allowed = new Set((Array.isArray(allowedIds) ? allowedIds : [])
    .map(normalizePositiveInteger)
    .filter(Boolean));

  return [...new Set(values
    .flatMap((entry) => String(entry ?? '').split(','))
    .map((entry) => normalizePositiveInteger(String(entry).trim()))
    .filter((entry) => entry && (allowed.size === 0 || allowed.has(entry))))]
    .sort((left, right) => left - right);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKeyFromUtcDate(date) {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate())
  ].join('-');
}

function addDaysToDateKey(dateKey, days) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  return dateKeyFromUtcDate(new Date(Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day + Number(days || 0),
    12,
    0,
    0
  )));
}

function getIsoWeekParts(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1, 12, 0, 0));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  return { year: isoYear, week };
}

function formatIsoWeekKey(dateKey) {
  const parts = getIsoWeekParts(dateKey);
  return parts ? `${parts.year}-W${pad2(parts.week)}` : '';
}

function parseIsoWeekKey(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;

  const januaryFourth = new Date(Date.UTC(year, 0, 4, 12, 0, 0));
  const januaryFourthWeekday = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthWeekday + 1 + ((week - 1) * 7));
  const startDate = dateKeyFromUtcDate(monday);

  if (formatIsoWeekKey(startDate) !== `${year}-W${pad2(week)}`) return null;

  return {
    startDate,
    endDate: addDaysToDateKey(startDate, 6)
  };
}

function parseMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  const startDate = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();

  return {
    startDate,
    endDate: `${year}-${pad2(month)}-${pad2(lastDay)}`
  };
}

function formatSqlUtcDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function formatScopeDate(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)));
}

function resolvePeriodFilters(query = {}, { now = new Date() } = {}) {
  const todayDate = formatDateKey(now, APP_DISPLAY_TIME_ZONE);
  const requestedPeriod = String(query.period || 'all_time').trim();
  const period = VALID_PERIODS.has(requestedPeriod) ? requestedPeriod : 'all_time';
  const selectedDate = String(query.date || '').trim() || todayDate;
  const selectedWeek = String(query.week || '').trim() || formatIsoWeekKey(todayDate);
  const selectedMonth = String(query.month || '').trim() || todayDate.slice(0, 7);
  const customStartDate = String(query.startDate || '').trim();
  const customEndDate = String(query.endDate || '').trim();
  let startDate = null;
  let endDate = null;
  let label = 'All Time';

  if (period === 'day') {
    if (!parseDateKey(selectedDate)) {
      throw new QcReportingScopeError('Choose a valid reporting day.');
    }
    startDate = selectedDate;
    endDate = selectedDate;
    label = formatScopeDate(selectedDate);
  }

  if (period === 'work_week') {
    const weekRange = parseIsoWeekKey(selectedWeek);
    if (!weekRange) {
      throw new QcReportingScopeError('Choose a valid reporting week.');
    }
    startDate = weekRange.startDate;
    endDate = weekRange.endDate;
    label = `${formatScopeDate(startDate)} – ${formatScopeDate(endDate)}`;
  }

  if (period === 'month') {
    const monthRange = parseMonthKey(selectedMonth);
    if (!monthRange) {
      throw new QcReportingScopeError('Choose a valid reporting month.');
    }
    startDate = monthRange.startDate;
    endDate = monthRange.endDate;
    label = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${startDate}T12:00:00Z`));
  }

  if (period === 'month_to_date') {
    startDate = `${todayDate.slice(0, 7)}-01`;
    endDate = todayDate;
    label = `${formatScopeDate(startDate)} – ${formatScopeDate(endDate)}`;
  }

  if (period === 'custom_range') {
    if (!parseDateKey(customStartDate) || !parseDateKey(customEndDate)) {
      throw new QcReportingScopeError('Choose both a valid Start date and End date.');
    }
    if (customStartDate > customEndDate) {
      throw new QcReportingScopeError('The Start date cannot be after the End date.');
    }
    startDate = customStartDate;
    endDate = customEndDate;
    label = startDate === endDate
      ? formatScopeDate(startDate)
      : `${formatScopeDate(startDate)} – ${formatScopeDate(endDate)}`;
  }

  const startRange = startDate ? getDayRangeUtc(startDate, APP_DISPLAY_TIME_ZONE) : null;
  const endRange = endDate ? getDayRangeUtc(endDate, APP_DISPLAY_TIME_ZONE) : null;

  return {
    period,
    selectedDate,
    selectedWeek,
    selectedMonth,
    customStartDate,
    customEndDate,
    startDate,
    endDate,
    startAt: startRange ? formatSqlUtcDateTime(startRange.startAt) : null,
    endAt: endRange ? formatSqlUtcDateTime(endRange.endAt) : null,
    label,
    todayDate
  };
}

function buildQcReportingScope(query = {}, technicianOptions = [], options = {}) {
  const period = resolvePeriodFilters(query, options);
  const normalizedOptions = (Array.isArray(technicianOptions) ? technicianOptions : [])
    .map((technician) => ({
      userId: normalizePositiveInteger(technician.userId ?? technician.user_id ?? technician.value),
      label: String(technician.label ?? technician.technicianName ?? technician.technician_name ?? '').trim()
    }))
    .filter((technician) => technician.userId);
  const selectedTechnicianIds = normalizeTechnicianIds(
    query.technicianId ?? query.technicianIds,
    normalizedOptions.map((technician) => technician.userId)
  );
  const selectedNames = normalizedOptions
    .filter((technician) => selectedTechnicianIds.includes(technician.userId))
    .map((technician) => technician.label || `Technician #${technician.userId}`);
  const teamLabel = selectedTechnicianIds.length === 0
    ? 'All reviewed technicians'
    : selectedNames.length <= 3
      ? selectedNames.join(', ')
      : `${selectedNames.length} selected technicians`;

  return {
    ...period,
    selectedTechnicianIds,
    teamLabel,
    scopeLabel: `${period.label} · ${teamLabel}`,
    queryFilters: {
      startAt: period.startAt,
      endAt: period.endAt,
      technicianUserIds: selectedTechnicianIds
    }
  };
}

module.exports = {
  QcReportingScopeError,
  REPORTING_PERIODS,
  addDaysToDateKey,
  buildQcReportingScope,
  formatIsoWeekKey,
  normalizeTechnicianIds,
  parseIsoWeekKey,
  parseMonthKey,
  resolvePeriodFilters
};
