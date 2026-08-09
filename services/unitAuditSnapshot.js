'use strict';

const { formatHardwareCapacityGb } = require('./hardwareCapacity');

const FIELD_DEFINITIONS = Object.freeze([
  ['asset_tag', 'Asset Tag', 'assetTag', 'asset_tag'],
  ['assignable_lot', 'Lot', 'lotId', 'lots'],
  ['unit_category', 'Unit Category', 'unitCategoryConfigValueId', 'unitCategories'],
  ['current_unit_status', 'Unit Status', 'currentUnitStatusConfigValueId', 'unitStatuses'],
  ['unit_serial_number', 'Unit Serial Number', 'unitSerialNumber', null],
  ['bios_serial_number', 'BIOS Serial Number', 'biosSerialNumber', null],
  ['manufacturer', 'Manufacturer', 'manufacturerId', 'manufacturers'],
  ['unit_model', 'Unit Model', 'unitModelId', 'unitModels'],
  ['processor_model', 'Processor', 'processorModelId', 'processorModels'],
  ['processor_speed_ghz', 'Processor Speed', 'processorSpeedGhz', null, ' GHz'],
  ['previous_memory_size', 'Previous Memory Size', 'previousRamGb', null],
  ['current_memory_size', 'Current Memory Size', 'ramGb', null],
  ['operating_system', 'Operating System', 'operatingSystemConfigValueId', 'operatingSystems'],
  ['production_weight_override', 'Production Weight Override', 'productionWeightOverride', null],
  ['production_weight_notes', 'Production Weight Notes', 'productionWeightNotes', null],
  ['bios_version', 'BIOS Version', 'biosVersion', null],
  ['previous_storage_size', 'Previous Storage Size', 'previousStorageGb', null],
  ['current_storage_size', 'Current Storage Size', 'storageGb', null],
  ['battery_health', 'Battery Health', 'batteryHealthPercent', null, '%'],
  ['os_build', 'OS Build', 'osBuild', null],
  ['absolute_status', 'Absolute Status', 'absoluteStatusConfigValueId', 'absoluteStatusOptions'],
  ['physical_camera_status', 'Physical Camera', 'physicalCameraStatusConfigValueId', 'physicalCameraStatusOptions'],
  ['touchscreen_status', 'Touchscreen', 'touchscreenStatusConfigValueId', 'touchscreenStatusOptions'],
  ['keyboard_language', 'Keyboard Language', 'keyboardLanguageConfigValueId', 'keyboardLanguageOptions'],
  ['complete_diagnostics', 'Complete Diagnostics', 'completeDiagnosticsStatusConfigValueId', 'diagnosticsStatusOptions'],
  ['virus_check', 'Virus Check', 'virusCheckStatusConfigValueId', 'virusCheckStatusOptions'],
  ['driver_check', 'Driver Check', 'driverCheckStatusConfigValueId', 'driverCheckStatusOptions'],
  ['skinned_status', 'Skinned Status', 'skinnedStatusConfigValueId', 'skinnedStatusOptions'],
  ['overall_grade', 'Overall Grade', 'overallGradeConfigValueId', 'overallGradeOptions'],
  ['overall_grade_notes', 'Grade Notes', 'overallGradeNotes', null],
  ['unit_outcome', 'Unit Outcome', 'outcomeCode', 'outcomeOptions'],
  ['unit_outcome_notes', 'Outcome Notes', 'outcomeNotes', null],
  ['hardware_notes', 'Hardware Notes', 'hardwareNotes', null],
  ['cosmetic_notes', 'Cosmetic Notes', 'cosmeticNotes', null]
]);

const REPEATABLE_DEFINITIONS = Object.freeze([
  ['previous_memory_modules', 'Previous Memory Modules', 'previousMemoryModules', formatMemoryRows],
  ['memory_modules', 'Current Memory Modules', 'memoryModules', formatMemoryRows],
  ['previous_storage_devices', 'Previous Storage Devices', 'previousStorageDevices', formatStorageRows],
  ['storage_devices', 'Current Storage Devices', 'storageDevices', formatStorageRows],
  ['cosmetic_issues', 'Cosmetic Issues', 'cosmeticIssues', formatCosmeticIssueRows],
  ['hardware_issues', 'Hardware Issues', 'hardwareIssues', formatHardwareIssueRows],
  ['graphics_adapters', 'Graphics Adapters', 'graphicsAdapters', formatGraphicsRows]
]);

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeRows(rows) {
  if (Array.isArray(rows)) return rows.filter((row) => row && typeof row === 'object');
  if (!rows || typeof rows !== 'object') return [];

  return Object.keys(rows)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => rows[key])
    .filter((row) => row && typeof row === 'object');
}

function optionLabel(options, id) {
  const token = normalizeText(id);
  if (!token) return '';

  const match = (Array.isArray(options) ? options : []).find((option) => {
    const candidate = option && (option.id ?? option.lot_id ?? option.value ?? option.code);
    return normalizeText(candidate) === token;
  });

  if (!match) return token;
  return normalizeText(match.shortLabel || match.label || match.name || match.lot_name || match.code || match.value || token);
}

function optionLabelByCollection(formOptions, collectionName, id) {
  if (!collectionName) return normalizeText(id);
  return optionLabel(formOptions && formOptions[collectionName], id);
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value
      .map(compactObject)
      .filter((entry) => entry !== null && entry !== '' && (!Array.isArray(entry) || entry.length > 0));
  }

  if (value && typeof value === 'object') {
    const result = {};
    Object.entries(value).forEach(([key, entry]) => {
      const compacted = compactObject(entry);
      const emptyObject = compacted && typeof compacted === 'object' && !Array.isArray(compacted) && Object.keys(compacted).length === 0;
      if (compacted !== null && compacted !== '' && !emptyObject && (!Array.isArray(compacted) || compacted.length > 0)) {
        result[key] = compacted;
      }
    });
    return result;
  }

  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? normalizeText(value) : value;
}

function rowHasValue(row) {
  return Object.values(row || {}).some((value) => normalizeText(value));
}

function formatMemoryRows(rows, formOptions) {
  const values = normalizeRows(rows)
    .filter(rowHasValue)
    .map((row) => compactObject({
      slot: row.slotLabel,
      sizeGb: row.sizeGb,
      type: optionLabelByCollection(formOptions, 'ramTypes', row.ramTypeConfigValueId),
      installType: optionLabelByCollection(formOptions, 'memoryInstallTypes', row.memoryInstallTypeCode),
      speedMhz: row.speedMhz,
      manufacturer: row.manufacturerName,
      partNumber: row.partNumber,
      serialNumber: row.serialNumber,
      notes: row.changeNotes
    }));

  return {
    value: values,
    text: values.map((row) => [
      row.sizeGb !== null && row.sizeGb !== undefined && String(row.sizeGb).trim() !== '' ? formatHardwareCapacityGb(row.sizeGb) : '',
      row.type || '',
      row.speedMhz ? `${row.speedMhz} MHz` : '',
      row.slot ? `(${row.slot})` : ''
    ].filter(Boolean).join(' ')).join('; ')
  };
}

function formatStorageRows(rows, formOptions) {
  const values = normalizeRows(rows)
    .filter(rowHasValue)
    .map((row) => compactObject({
      slot: row.slotLabel,
      sizeGb: row.sizeGb,
      type: optionLabelByCollection(formOptions, 'storageTypes', row.storageTypeConfigValueId),
      manufacturer: row.manufacturerName,
      model: row.modelNumber,
      serialNumber: row.serialNumber,
      firmware: row.firmwareVersion,
      wipeStatus: optionLabelByCollection(formOptions, 'storageWipeStatuses', row.wipeStatusConfigValueId),
      notes: row.changeNotes
    }));

  return {
    value: values,
    text: values.map((row) => [
      row.sizeGb !== null && row.sizeGb !== undefined && String(row.sizeGb).trim() !== '' ? formatHardwareCapacityGb(row.sizeGb) : '',
      row.type || '',
      row.model || '',
      row.slot ? `(${row.slot})` : ''
    ].filter(Boolean).join(' ')).join('; ')
  };
}

function formatCosmeticIssueRows(rows, formOptions) {
  const values = normalizeRows(rows)
    .filter(rowHasValue)
    .map((row) => compactObject({
      issue: optionLabelByCollection(formOptions, 'cosmeticIssueTypes', row.issueTypeConfigValueId),
      severity: optionLabelByCollection(formOptions, 'issueSeverities', row.severityConfigValueId),
      location: optionLabelByCollection(formOptions, 'issueLocations', row.locationConfigValueId),
      remark: row.issueRemark
    }));

  return { value: values, text: values.map((row) => [row.issue, row.severity, row.location].filter(Boolean).join(' · ')).join('; ') };
}

function formatHardwareIssueRows(rows, formOptions) {
  const values = normalizeRows(rows)
    .filter(rowHasValue)
    .map((row) => compactObject({
      issue: optionLabelByCollection(formOptions, 'hardwareIssueTypes', row.issueTypeConfigValueId) || normalizeText(row.customIssueLabel),
      location: optionLabelByCollection(formOptions, 'issueLocations', row.locationConfigValueId),
      remark: row.issueRemark
    }));

  return { value: values, text: values.map((row) => [row.issue, row.location].filter(Boolean).join(' · ')).join('; ') };
}

function formatGraphicsRows(rows, formOptions) {
  const values = normalizeRows(rows)
    .filter(rowHasValue)
    .map((row) => compactObject({
      type: optionLabelByCollection(formOptions, 'gpuTypeOptions', row.gpuTypeConfigValueId),
      model: row.gpuModel,
      vramMb: row.vramMb
    }));

  return { value: values, text: values.map((row) => [row.type, row.model, row.vramMb ? `${row.vramMb} MB` : ''].filter(Boolean).join(' ')).join('; ') };
}

function makeEntry(label, value, text) {
  const compactedValue = compactObject(value);
  const normalizedText = normalizeText(text);
  const emptyObject = compactedValue && typeof compactedValue === 'object' && !Array.isArray(compactedValue) && Object.keys(compactedValue).length === 0;
  const isEmpty = compactedValue === null || compactedValue === '' || emptyObject || (Array.isArray(compactedValue) && compactedValue.length === 0);

  return {
    label,
    value: isEmpty ? null : compactedValue,
    text: normalizedText || (isEmpty ? '' : normalizeText(compactedValue))
  };
}

function buildUnitAuditSnapshot(formData = {}, formOptions = {}) {
  const snapshot = {};

  FIELD_DEFINITIONS.forEach(([fieldKey, label, property, collectionName, suffix = '']) => {
    const rawValue = formData[property];
    const text = collectionName
      ? optionLabelByCollection(formOptions, collectionName, rawValue)
      : normalizeText(rawValue);
    const displayText = ['previous_memory_size', 'current_memory_size', 'previous_storage_size', 'current_storage_size'].includes(fieldKey)
      ? formatHardwareCapacityGb(rawValue)
      : (text ? `${text}${suffix}` : '');
    snapshot[fieldKey] = makeEntry(label, collectionName ? normalizeText(rawValue) : rawValue, displayText);
  });

  REPEATABLE_DEFINITIONS.forEach(([fieldKey, label, property, formatter]) => {
    const formatted = formatter(formData[property], formOptions);
    snapshot[fieldKey] = makeEntry(label, formatted.value, formatted.text);
  });

  return snapshot;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function valuesEqual(left, right) {
  return stableJson(left == null ? null : left) === stableJson(right == null ? null : right);
}

function getChangeType(oldValue, newValue, mode) {
  if (mode === 'create') return 'created';
  if (oldValue == null && newValue != null) return 'added';
  if (oldValue != null && newValue == null) return 'removed';
  return 'changed';
}

function diffUnitAuditSnapshots(beforeSnapshot = {}, afterSnapshot = {}, { mode = 'edit' } = {}) {
  const fieldKeys = Array.from(new Set([
    ...Object.keys(beforeSnapshot || {}),
    ...Object.keys(afterSnapshot || {})
  ]));

  return fieldKeys.reduce((changes, fieldKey, index) => {
    const before = beforeSnapshot[fieldKey] || { label: fieldKey, value: null, text: '' };
    const after = afterSnapshot[fieldKey] || { label: before.label || fieldKey, value: null, text: '' };

    if (valuesEqual(before.value, after.value)) return changes;
    if (mode === 'create' && after.value == null) return changes;

    changes.push({
      fieldKey,
      fieldLabel: after.label || before.label || fieldKey,
      changeType: getChangeType(before.value, after.value, mode),
      oldValue: before.value,
      newValue: after.value,
      oldValueText: before.text || '',
      newValueText: after.text || '',
      sortOrder: (index + 1) * 10
    });

    return changes;
  }, []);
}

function buildUnitFormAuditEvent({
  mode,
  unitId,
  actorUserId,
  beforeFormData = null,
  afterFormData,
  formOptions,
  source = 'tech_unit_form'
}) {
  const normalizedMode = mode === 'create' ? 'create' : 'edit';
  const beforeSnapshot = normalizedMode === 'create'
    ? {}
    : buildUnitAuditSnapshot(beforeFormData || {}, formOptions || {});
  const afterSnapshot = buildUnitAuditSnapshot(afterFormData || {}, formOptions || {});
  const changes = diffUnitAuditSnapshots(beforeSnapshot, afterSnapshot, { mode: normalizedMode });
  const assetTag = afterSnapshot.asset_tag && afterSnapshot.asset_tag.text;
  const commentText = normalizeText(afterFormData && afterFormData.generalCommentText);

  if (commentText) {
    changes.push({
      fieldKey: 'general_comment',
      fieldLabel: 'General Comment',
      changeType: 'added',
      oldValue: null,
      newValue: commentText,
      oldValueText: '',
      newValueText: commentText,
      sortOrder: 1000
    });
  }

  return {
    unitId: Number(unitId),
    actorUserId: Number(actorUserId) || null,
    eventType: normalizedMode === 'create' ? 'unit_created' : 'unit_updated',
    eventSource: source,
    eventSummary: normalizedMode === 'create'
      ? `Created unit${assetTag ? ` ${assetTag}` : ''}`
      : `Updated unit${assetTag ? ` ${assetTag}` : ''}`,
    metadata: {
      mode: normalizedMode,
      assetTag: assetTag || null,
      changeCount: changes.length
    },
    changes
  };
}

module.exports = {
  buildUnitAuditSnapshot,
  buildUnitFormAuditEvent,
  diffUnitAuditSnapshots,
  optionLabel,
  stableJson
};
