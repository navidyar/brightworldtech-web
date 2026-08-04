'use strict';

const TERABYTE_GB = 1024;

function normalizeNumericText(value) {
  return String(value ?? '').trim().replace(/,/g, '');
}

function trimDecimal(value) {
  return Number(value).toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function parseHardwareCapacityToGb(value) {
  const normalized = normalizeNumericText(value);

  if (!normalized) {
    return {
      valid: true,
      gb: null,
      canonical: ''
    };
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(GB|TB)?$/i);

  if (!match) {
    return {
      valid: false,
      gb: null,
      canonical: normalized,
      message: 'Enter a capacity such as 16GB, 512GB, 1TB, or 2TB.'
    };
  }

  const amount = Number(match[1]);
  const unit = String(match[2] || 'GB').toUpperCase();
  let gb = unit === 'TB' ? amount * TERABYTE_GB : amount;

  if (unit === 'GB' && amount >= 1000) {
    if (!Number.isInteger(amount)) {
      return {
        valid: false,
        gb: null,
        canonical: normalized,
        message: 'Enter large capacities as a whole TB value, such as 1TB or 2TB.'
      };
    }

    if (amount % TERABYTE_GB === 0) {
      gb = amount;
    } else if (amount % 1000 === 0) {
      gb = (amount / 1000) * TERABYTE_GB;
    } else {
      return {
        valid: false,
        gb: null,
        canonical: normalized,
        message: 'Enter a standard TB capacity. For example, 1000 or 1024 becomes 1TB, and 2000 or 2048 becomes 2TB.'
      };
    }
  }

  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(gb)) {
    return {
      valid: false,
      gb: null,
      canonical: normalized,
      message: 'Capacity must resolve to a non-negative whole number of GB. Use 0 for an empty slot, or values such as 16GB, 512GB, 1TB, or 1.5TB.'
    };
  }

  return {
    valid: true,
    gb,
    canonical: formatHardwareCapacityGb(gb)
  };
}

function formatHardwareCapacityGb(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return '';
  }

  if (numeric === 0) {
    return '0GB';
  }

  if (Number.isInteger(numeric) && numeric >= 1000) {
    if (numeric % TERABYTE_GB === 0) {
      return `${trimDecimal(numeric / TERABYTE_GB)}TB`;
    }

    if (numeric % 1000 === 0) {
      return `${trimDecimal(numeric / 1000)}TB`;
    }

    if (numeric % 256 === 0) {
      return `${trimDecimal(numeric / TERABYTE_GB)}TB`;
    }
  }

  return `${trimDecimal(numeric)}GB`;
}

function normalizeHardwareCapacityForStorage(value) {
  const parsed = parseHardwareCapacityToGb(value);

  if (!parsed.valid) {
    return normalizeNumericText(value);
  }

  return parsed.gb === null ? '' : String(parsed.gb);
}

module.exports = {
  TERABYTE_GB,
  parseHardwareCapacityToGb,
  formatHardwareCapacityGb,
  normalizeHardwareCapacityForStorage
};
