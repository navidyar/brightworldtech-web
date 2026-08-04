'use strict';

const UNIT_EXPORT_COLUMNS = Object.freeze([
  Object.freeze({ key: 'assetTag', label: 'Asset Tag' }),
  Object.freeze({ key: 'unitSerialNumber', label: 'Unit Serial Number' }),
  Object.freeze({ key: 'biosSerialNumber', label: 'BIOS Serial Number' }),
  Object.freeze({ key: 'unitType', label: 'Unit Type' }),
  Object.freeze({ key: 'manufacturer', label: 'Manufacturer' }),
  Object.freeze({ key: 'model', label: 'Model' }),
  Object.freeze({ key: 'cpu', label: 'CPU' }),
  Object.freeze({ key: 'shortForm', label: 'Short Form' }),
  Object.freeze({ key: 'previousMemorySize', label: 'Previous Memory Size' }),
  Object.freeze({ key: 'currentMemorySize', label: 'Current Memory Size' }),
  Object.freeze({ key: 'previousStorageSize', label: 'Previous Storage Size' }),
  Object.freeze({ key: 'currentStorageSize', label: 'Current Storage Size' }),
  Object.freeze({ key: 'previousMemoryModules', label: 'Previous Memory Modules' }),
  Object.freeze({ key: 'currentMemoryModules', label: 'Current Memory Modules' }),
  Object.freeze({ key: 'memoryModuleChanges', label: 'Memory Module Changes' }),
  Object.freeze({ key: 'previousStorageDevices', label: 'Previous Storage Devices' }),
  Object.freeze({ key: 'currentStorageDevices', label: 'Current Storage Devices' }),
  Object.freeze({ key: 'storageDeviceChanges', label: 'Storage Device Changes' }),
  Object.freeze({ key: 'techName', label: 'Tech Name' }),
  Object.freeze({ key: 'batteryHealth', label: 'Battery Health' }),
  Object.freeze({ key: 'cosmeticGrade', label: 'Cosmetic Grade' }),
  Object.freeze({ key: 'passFail', label: 'Pass / Fail' }),
  Object.freeze({ key: 'hardwareRemarks', label: 'Hardware Remarks' }),
  Object.freeze({ key: 'cosmeticRemarks', label: 'Cosmetic Remarks' })
]);

const UNIT_EXPORT_COLUMN_KEYS = Object.freeze(UNIT_EXPORT_COLUMNS.map((column) => column.key));
const UNIT_EXPORT_COLUMN_LABELS = Object.freeze(UNIT_EXPORT_COLUMNS.map((column) => column.label));
const DEFAULT_UNIT_EXPORT_COLUMNS = Object.freeze(
  UNIT_EXPORT_COLUMNS.filter((column) => column.defaultSelected !== false)
);
const UNIT_EXPORT_COLUMN_KEY_SET = new Set(UNIT_EXPORT_COLUMN_KEYS);
const UNIT_EXPORT_COLUMN_KEY_ALIASES = Object.freeze({
  memorySize: 'currentMemorySize',
  storageSize: 'currentStorageSize'
});

function parseUnitExportColumnKeys(value) {
  const values = Array.isArray(value) ? value : [value];
  const keys = [];
  const seen = new Set();

  values.forEach((entry) => {
    String(entry ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
      .forEach((key) => {
        const resolvedKey = UNIT_EXPORT_COLUMN_KEY_ALIASES[key] || key;
        if (UNIT_EXPORT_COLUMN_KEY_SET.has(resolvedKey) && !seen.has(resolvedKey)) {
          seen.add(resolvedKey);
          keys.push(resolvedKey);
        }
      });
  });

  return keys;
}

function resolveUnitExportColumns(value, { selectionProvided = false } = {}) {
  if (!selectionProvided) {
    return DEFAULT_UNIT_EXPORT_COLUMNS;
  }

  const selectedKeys = new Set(parseUnitExportColumnKeys(value));
  const selectedColumns = UNIT_EXPORT_COLUMNS.filter((column) => selectedKeys.has(column.key));

  if (selectedColumns.length === 0) {
    const error = new Error('Select at least one Unit export column.');
    error.code = 'BWT_UNIT_EXPORT_COLUMNS_REQUIRED';
    throw error;
  }

  return Object.freeze(selectedColumns);
}

module.exports = {
  DEFAULT_UNIT_EXPORT_COLUMNS,
  UNIT_EXPORT_COLUMNS,
  UNIT_EXPORT_COLUMN_KEYS,
  UNIT_EXPORT_COLUMN_LABELS,
  parseUnitExportColumnKeys,
  resolveUnitExportColumns
};
