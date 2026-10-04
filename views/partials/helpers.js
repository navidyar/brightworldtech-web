const { FALLBACK_TIME_ZONE, normalizeTimeZone } = require('../../utils/timeZone');

function escapeHtml(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value, timeZone = FALLBACK_TIME_ZONE) {
  const date = normalizeDate(value);
  if (!date) return '—';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE)
  }).format(date);
}

function formatDate(value, timeZone = FALLBACK_TIME_ZONE) {
  const date = normalizeDate(value);
  if (!date) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE)
  }).format(date);
}

function formatTime(value, timeZone = FALLBACK_TIME_ZONE) {
  const date = normalizeDate(value);
  if (!date) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE)
  }).format(date);
}

function formatTimeWithZone(value, timeZone = FALLBACK_TIME_ZONE) {
  const date = normalizeDate(value);
  if (!date) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE),
    timeZoneName: 'short'
  }).format(date);
}

function createDateTimeHelpers(timeZone) {
  const safeTimeZone = normalizeTimeZone(timeZone, FALLBACK_TIME_ZONE);
  return {
    formatDateTime: (value) => formatDateTime(value, safeTimeZone),
    formatDate: (value) => formatDate(value, safeTimeZone),
    formatTime: (value) => formatTime(value, safeTimeZone),
    formatTimeWithZone: (value) => formatTimeWithZone(value, safeTimeZone),
    formatDateKeyLabel
  };
}

function formatDateKeyLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return '—';
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-US').format(number);
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / (1024 ** index);
  const decimals = index === 0 || amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(decimals)} ${units[index]}`;
}

function formatRoleLabel(roleCode) {
  const normalized = String(roleCode || '').trim().toLowerCase();
  const labels = {
    admin: 'Admin',
    management: 'Management',
    tech_lead: 'Tech Lead',
    qc: 'Quality Control',
    tech: 'Tech'
  };

  return labels[normalized] || normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatWeight(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toFixed(2);
}

module.exports = {
  escapeHtml,
  formatDateTime,
  formatDate,
  formatTime,
  formatTimeWithZone,
  formatDateKeyLabel,
  createDateTimeHelpers,
  formatNumber,
  formatBytes,
  formatRoleLabel,
  formatWeight
};
