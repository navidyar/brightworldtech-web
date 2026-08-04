'use strict';

const { formatHardwareCapacityGb } = require('./hardwareCapacity');

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeCapacity(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeSlotLabel(row, fallbackLabel, index) {
  return normalizeText(row && (row.slotLabel || row.slot)) || `${fallbackLabel} ${index + 1}`;
}

function normalizeSlotKey(label, occurrence) {
  const base = normalizeText(label).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${base || 'position'}#${occurrence}`;
}

function buildOccurrenceKeys(rows, fallbackLabel) {
  const counts = new Map();

  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const slotLabel = normalizeSlotLabel(row, fallbackLabel, index);
    const normalizedLabel = slotLabel.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'position';
    const occurrence = (counts.get(normalizedLabel) || 0) + 1;
    counts.set(normalizedLabel, occurrence);

    return {
      key: normalizeSlotKey(slotLabel, occurrence),
      row,
      index,
      slotLabel
    };
  });
}

function normalizeMemoryComponent(row, index = 0) {
  if (!row) return null;

  const sizeGb = normalizeCapacity(row.sizeGb);
  const slotLabel = normalizeSlotLabel(row, 'Slot', index);
  const typeLabel = normalizeText(row.ramTypeLabel || row.type || row.ramTypeConfigValueId);
  const installTypeLabel = normalizeText(
    row.memoryInstallTypeLabel
    || row.installType
    || row.memoryInstallTypeCode
  );

  return {
    kind: 'memory',
    slotLabel,
    sizeGb,
    sizeLabel: sizeGb === null ? 'Not recorded' : formatHardwareCapacityGb(sizeGb),
    typeLabel,
    installTypeLabel,
    isEmpty: sizeGb === 0,
    signature: JSON.stringify({
      sizeGb,
      typeLabel: typeLabel.toLowerCase(),
      installTypeLabel: installTypeLabel.toLowerCase()
    })
  };
}

function normalizeStorageComponent(row, index = 0) {
  if (!row) return null;

  const sizeGb = normalizeCapacity(row.sizeGb);
  const slotLabel = normalizeSlotLabel(row, 'Drive', index);
  const typeLabel = normalizeText(row.storageTypeLabel || row.type || row.storageTypeConfigValueId);
  const wipeStatusLabel = normalizeText(row.wipeStatusLabel || row.wipeStatus || row.wipeStatusConfigValueId);

  return {
    kind: 'storage',
    slotLabel,
    sizeGb,
    sizeLabel: sizeGb === null ? 'Not recorded' : formatHardwareCapacityGb(sizeGb),
    typeLabel,
    wipeStatusLabel,
    isEmpty: sizeGb === 0,
    signature: JSON.stringify({
      sizeGb,
      typeLabel: typeLabel.toLowerCase(),
      wipeStatusLabel: wipeStatusLabel.toLowerCase()
    })
  };
}

function componentText(component) {
  if (!component) return 'Not recorded';
  if (component.isEmpty) return '0GB · Empty slot';

  const details = component.kind === 'memory'
    ? [component.sizeLabel, component.typeLabel, component.installTypeLabel]
    : [component.sizeLabel, component.typeLabel, component.wipeStatusLabel ? `Wipe: ${component.wipeStatusLabel}` : ''];

  return details.filter(Boolean).join(' · ') || 'Not recorded';
}

function comparisonStatus(previous, current, { hasPreviousSnapshot, hasCurrentSnapshot }) {
  if (!previous && current) {
    return hasPreviousSnapshot ? 'added' : 'current_only';
  }

  if (previous && !current) {
    return hasCurrentSnapshot ? 'removed' : 'previous_only';
  }

  if (!previous && !current) {
    return 'unchanged';
  }

  if (previous.sizeGb === 0 && current.sizeGb > 0) {
    return 'added';
  }

  if (previous.sizeGb > 0 && current.sizeGb === 0) {
    return 'removed';
  }

  if (previous.signature !== current.signature) {
    return 'changed';
  }

  if (previous.isEmpty && current.isEmpty) {
    return 'empty';
  }

  return 'unchanged';
}

const STATUS_LABELS = Object.freeze({
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  unchanged: 'Unchanged',
  empty: 'Empty',
  current_only: 'Current only',
  previous_only: 'Previous only'
});

function buildHardwareComponentComparisons(previousRows, currentRows, { kind = 'memory' } = {}) {
  const normalizedKind = kind === 'storage' ? 'storage' : 'memory';
  const fallbackLabel = normalizedKind === 'storage' ? 'Drive' : 'Slot';
  const normalizeComponent = normalizedKind === 'storage'
    ? normalizeStorageComponent
    : normalizeMemoryComponent;
  const previousEntries = buildOccurrenceKeys(previousRows, fallbackLabel);
  const currentEntries = buildOccurrenceKeys(currentRows, fallbackLabel);
  const previousByKey = new Map(previousEntries.map((entry) => [entry.key, entry]));
  const currentByKey = new Map(currentEntries.map((entry) => [entry.key, entry]));
  const orderedKeys = [];

  previousEntries.forEach((entry) => orderedKeys.push(entry.key));
  currentEntries.forEach((entry) => {
    if (!previousByKey.has(entry.key)) orderedKeys.push(entry.key);
  });

  const hasPreviousSnapshot = previousEntries.length > 0;
  const hasCurrentSnapshot = currentEntries.length > 0;

  return orderedKeys.map((key, comparisonIndex) => {
    const previousEntry = previousByKey.get(key) || null;
    const currentEntry = currentByKey.get(key) || null;
    const previous = previousEntry ? normalizeComponent(previousEntry.row, previousEntry.index) : null;
    const current = currentEntry ? normalizeComponent(currentEntry.row, currentEntry.index) : null;
    const statusCode = comparisonStatus(previous, current, {
      hasPreviousSnapshot,
      hasCurrentSnapshot
    });
    const slotLabel = (current && current.slotLabel)
      || (previous && previous.slotLabel)
      || `${fallbackLabel} ${comparisonIndex + 1}`;

    return {
      key,
      kind: normalizedKind,
      slotLabel,
      previous,
      current,
      previousText: componentText(previous),
      currentText: componentText(current),
      statusCode,
      statusLabel: STATUS_LABELS[statusCode] || 'Changed',
      hasDifference: ['added', 'removed', 'changed'].includes(statusCode)
    };
  });
}

function formatHardwareComponentList(rows, { kind = 'memory' } = {}) {
  const normalizedKind = kind === 'storage' ? 'storage' : 'memory';
  const normalizeComponent = normalizedKind === 'storage'
    ? normalizeStorageComponent
    : normalizeMemoryComponent;

  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => normalizeComponent(row, index))
    .filter(Boolean)
    .map((component) => `${component.slotLabel}: ${componentText(component)}`)
    .join('\n');
}

function formatHardwareComparisonList(comparisons) {
  const safeComparisons = Array.isArray(comparisons) ? comparisons : [];
  const changes = safeComparisons.filter((comparison) => comparison && comparison.hasDifference);

  if (changes.length === 0) {
    if (safeComparisons.length === 0) return '';
    if (safeComparisons.some((comparison) => ['current_only', 'previous_only'].includes(comparison.statusCode))) {
      return 'A complete Previous/Current component comparison is not available.';
    }
    return 'No component changes.';
  }

  return changes.map((comparison) => (
    `${comparison.slotLabel} — ${comparison.statusLabel}: ${comparison.previousText} → ${comparison.currentText}`
  )).join('\n');
}

module.exports = {
  buildHardwareComponentComparisons,
  componentText,
  formatHardwareComparisonList,
  formatHardwareComponentList,
  normalizeMemoryComponent,
  normalizeStorageComponent
};
