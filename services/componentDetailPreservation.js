'use strict';

const MEMORY_DETAIL_COLUMNS = Object.freeze([
  'speed_mhz',
  'manufacturer_name',
  'part_number',
  'serial_number',
  'change_notes'
]);

const STORAGE_DETAIL_COLUMNS = Object.freeze([
  'manufacturer_name',
  'model_number',
  'serial_number',
  'firmware_version',
  'wipe_status_config_value_id',
  'change_notes'
]);

function mergePreservedMemoryDetails(moduleRow, detailMap) {
  if (!moduleRow || moduleRow.sizeGb === 0 || !moduleRow.componentRowId) {
    return moduleRow;
  }

  const stored = detailMap.get(Number(moduleRow.componentRowId));

  if (!stored) {
    return moduleRow;
  }

  return {
    ...moduleRow,
    speedMhz: stored.speed_mhz,
    manufacturerName: stored.manufacturer_name,
    partNumber: stored.part_number,
    serialNumber: stored.serial_number,
    changeNotes: stored.change_notes
  };
}

function mergePreservedStorageDetails(deviceRow, detailMap, { includeWipeStatus = false } = {}) {
  if (!deviceRow || deviceRow.sizeGb === 0 || !deviceRow.componentRowId) {
    return deviceRow;
  }

  const stored = detailMap.get(Number(deviceRow.componentRowId));

  if (!stored) {
    return deviceRow;
  }

  return {
    ...deviceRow,
    manufacturerName: stored.manufacturer_name,
    modelNumber: stored.model_number,
    serialNumber: stored.serial_number,
    firmwareVersion: stored.firmware_version,
    changeNotes: stored.change_notes,
    wipeStatusConfigValueId: includeWipeStatus
      ? (deviceRow.wipeStatusConfigValueId || stored.wipe_status_config_value_id)
      : stored.wipe_status_config_value_id
  };
}

module.exports = {
  MEMORY_DETAIL_COLUMNS,
  STORAGE_DETAIL_COLUMNS,
  mergePreservedMemoryDetails,
  mergePreservedStorageDetails
};
