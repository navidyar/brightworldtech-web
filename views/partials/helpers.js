function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const APP_DISPLAY_TIME_ZONE = 'America/Chicago';

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: APP_DISPLAY_TIME_ZONE
  }).format(date);
}


function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: APP_DISPLAY_TIME_ZONE
  }).format(date);
}

function formatTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: APP_DISPLAY_TIME_ZONE
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

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
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return number.toFixed(2);
}

module.exports = {
  escapeHtml,
  formatDateTime,
  formatDate,
  formatTime,
  formatNumber,
  formatBytes,
  formatRoleLabel,
  formatWeight
};