'use strict';

const UNIT_EXPORT_COLUMNS = Object.freeze([
  Object.freeze({ key: 'assetTag', label: 'Asset Tag' }),
  Object.freeze({ key: 'unitSerialNumber', label: 'Unit Serial Number' }),
  Object.freeze({ key: 'biosSerialNumber', label: 'BIOS Serial / Recovery Number' }),
  Object.freeze({ key: 'amazonAssetTag', label: 'Amazon Asset Tag', defaultSelected: false }),
  Object.freeze({ key: 'fnsku', label: 'FNSKU', defaultSelected: false }),
  Object.freeze({ key: 'asin', label: 'ASIN', defaultSelected: false }),
  Object.freeze({ key: 'trackingNumber', label: 'Tracking Number', defaultSelected: false }),
  Object.freeze({ key: 'palletNumber', label: 'Pallet Number', defaultSelected: false }),
  Object.freeze({ key: 'buyerComments', label: 'Buyer Comments', defaultSelected: false }),
  Object.freeze({ key: 'unitType', label: 'Unit Type' }),
  Object.freeze({ key: 'manufacturer', label: 'Manufacturer' }),
  Object.freeze({ key: 'model', label: 'Model' }),
  Object.freeze({ key: 'screenSize', label: 'Screen Size', defaultSelected: false }),
  Object.freeze({ key: 'modelYear', label: 'Model Year', defaultSelected: false }),
  Object.freeze({ key: 'appleModelNumber', label: 'Apple Model Number', defaultSelected: false }),
  Object.freeze({ key: 'operatingSystem', label: 'Operating System', defaultSelected: false }),
  Object.freeze({ key: 'osBuild', label: 'OS Build / Version', defaultSelected: false }),
  Object.freeze({ key: 'biosVersion', label: 'BIOS / Firmware Version', defaultSelected: false }),
  Object.freeze({ key: 'keyboardLanguage', label: 'Keyboard Language', defaultSelected: false }),
  Object.freeze({ key: 'wifiCardPresent', label: 'Wi-Fi Card Present', defaultSelected: false }),
  Object.freeze({ key: 'chargerIncluded', label: 'Charger Included', defaultSelected: false }),
  Object.freeze({ key: 'displayType', label: 'Display Type', defaultSelected: false }),
  Object.freeze({ key: 'nativeScreenResolution', label: 'Native Screen Resolution', defaultSelected: false }),
  Object.freeze({ key: 'refreshRate', label: 'Refresh Rate', defaultSelected: false }),
  Object.freeze({ key: 'color', label: 'Color', defaultSelected: false }),
  Object.freeze({ key: 'cameras', label: 'Cameras', defaultSelected: false }),
  Object.freeze({ key: 'batteries', label: 'Batteries', defaultSelected: false }),
  Object.freeze({ key: 'biometrics', label: 'Biometrics', defaultSelected: false }),
  Object.freeze({ key: 'portsExpansion', label: 'Ports / Expansion', defaultSelected: false }),
  Object.freeze({ key: 'keyboardTest', label: 'Keyboard Test', defaultSelected: false }),
  Object.freeze({ key: 'touchscreenTest', label: 'Touchscreen Test', defaultSelected: false }),
  Object.freeze({ key: 'microphoneCheck', label: 'Microphone Check', defaultSelected: false }),
  Object.freeze({ key: 'audioOutputCheck', label: 'Audio Output Check', defaultSelected: false }),
  Object.freeze({ key: 'allScrewsPresent', label: 'All Screws Present', defaultSelected: false }),
  Object.freeze({ key: 'diagnosticsTest', label: 'Diagnostics Test', defaultSelected: false }),
  Object.freeze({ key: 'threatProtectionScan', label: 'Threat Protection Scan', defaultSelected: false }),
  Object.freeze({ key: 'driverCheck', label: 'Driver Check', defaultSelected: false }),
  Object.freeze({ key: 'absoluteStatus', label: 'Absolute Status', defaultSelected: false }),
  Object.freeze({ key: 'biosLock', label: 'BIOS Lock', defaultSelected: false }),
  Object.freeze({ key: 'efiLock', label: 'EFI Lock', defaultSelected: false }),
  Object.freeze({ key: 'mdmLock', label: 'MDM Lock', defaultSelected: false }),
  Object.freeze({ key: 'icloudActivationLock', label: 'iCloud Activation Lock', defaultSelected: false }),
  Object.freeze({ key: 'ceCertification', label: 'CE Certification', defaultSelected: false }),
  Object.freeze({ key: 'openBoxStatus', label: 'Open-Box Status', defaultSelected: false }),
  Object.freeze({ key: 'boxLanguage', label: 'Box Language', defaultSelected: false }),
  Object.freeze({ key: 'cpu', label: 'CPU' }),
  Object.freeze({ key: 'processorSpeedGhz', label: 'Processor Speed GHz', defaultSelected: false }),
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
  Object.freeze({ key: 'createdDate', label: 'Created Date', defaultSelected: false }),
  Object.freeze({ key: 'createdTime', label: 'Created Time', defaultSelected: false }),
  Object.freeze({ key: 'completedDate', label: 'Completed Date', defaultSelected: false }),
  Object.freeze({ key: 'completedTime', label: 'Completed Time', defaultSelected: false }),
  Object.freeze({ key: 'batteryHealth', label: 'Battery Health' }),
  Object.freeze({ key: 'skinnedStatus', label: 'Skinned Status', defaultSelected: false }),
  Object.freeze({ key: 'cosmeticGrade', label: 'Cosmetic Grade' }),
  Object.freeze({ key: 'gradeNotes', label: 'Grade Notes', defaultSelected: false }),
  Object.freeze({ key: 'passFail', label: 'Pass / Fail' }),
  Object.freeze({ key: 'outcomeNotes', label: 'Outcome Notes', defaultSelected: false }),
  Object.freeze({ key: 'hardwareRemarks', label: 'Hardware Remarks' }),
  Object.freeze({ key: 'cosmeticRemarks', label: 'Cosmetic Remarks' }),
  Object.freeze({ key: 'generalComment', label: 'General Comment', defaultSelected: false })
]);

const UNIT_EXPORT_COLUMN_KEYS = Object.freeze(UNIT_EXPORT_COLUMNS.map((column) => column.key));
const UNIT_EXPORT_COLUMN_LABELS = Object.freeze(UNIT_EXPORT_COLUMNS.map((column) => column.label));
// Export selection is deliberate: the modal always opens with no columns selected.
const DEFAULT_UNIT_EXPORT_COLUMNS = Object.freeze([]);
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
