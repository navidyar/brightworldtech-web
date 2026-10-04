'use strict';

const LOGIN_INACTIVITY_THRESHOLD_BUSINESS_DAYS = 5;

function startOfUtcDay(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function businessDaysSince(value, now = new Date()) {
  const start = startOfUtcDay(value);
  const end = startOfUtcDay(now);
  if (!start || !end || start >= end) return 0;
  let count = 0;
  const cursor = new Date(start.getTime());
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function getLoginInactivityState({ monitored = false, isActive = false, accountStatusCode = '', lastLoginAt = null, startDate = null, createdAt = null, now = new Date() } = {}) {
  if (!monitored || !isActive || accountStatusCode !== 'active') {
    return { monitored: Boolean(monitored), businessDays: null, overdue: false, referenceAt: null };
  }
  const referenceAt = lastLoginAt || startDate || createdAt || null;
  if (!referenceAt) return { monitored: true, businessDays: null, overdue: false, referenceAt: null };
  const businessDays = businessDaysSince(referenceAt, now);
  return {
    monitored: true,
    businessDays,
    overdue: businessDays > LOGIN_INACTIVITY_THRESHOLD_BUSINESS_DAYS,
    referenceAt
  };
}

module.exports = { LOGIN_INACTIVITY_THRESHOLD_BUSINESS_DAYS, businessDaysSince, getLoginInactivityState };
