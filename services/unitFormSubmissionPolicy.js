'use strict';

const {
  UNIT_FORM_FIELD_REGISTRY,
  RULE_TYPE
} = require('../config/unitFormFieldRegistry');

const POLICY_METADATA_KEY = '_unitFormSubmissionPolicy';

const FIELD_BINDINGS = Object.freeze({
  unit_serial_number: Object.freeze({ properties: ['unitSerialNumber'] }),
  bios_serial_number: Object.freeze({ properties: ['biosSerialNumber'] }),
  manufacturer: Object.freeze({ properties: ['manufacturerId'] }),
  unit_model: Object.freeze({ properties: ['unitModelId'] }),
  processor_model: Object.freeze({ properties: ['processorModelId'] }),
  processor_speed_ghz: Object.freeze({ properties: ['processorSpeedGhz'] }),
  previous_memory_size: Object.freeze({ properties: ['previousRamGb', 'previousMemoryModules'] }),
  memory_modules: Object.freeze({
    properties: ['memoryModules', 'ramGb', 'ramTypeConfigValueId'],
    repeatableType: 'memory'
  }),
  previous_storage_size: Object.freeze({ properties: ['previousStorageGb', 'previousStorageDevices'] }),
  storage_devices: Object.freeze({
    properties: ['storageDevices', 'storageGb', 'storageTypeConfigValueId'],
    repeatableType: 'storage'
  }),
  operating_system: Object.freeze({ properties: ['operatingSystemConfigValueId'] }),
  os_build: Object.freeze({ properties: ['osBuild'] }),
  bios_version: Object.freeze({ properties: ['biosVersion'] }),
  battery_health: Object.freeze({ properties: ['batteryHealthPercent'] }),
  absolute_status: Object.freeze({ properties: ['absoluteStatusConfigValueId'] }),
  physical_camera_status: Object.freeze({ properties: ['physicalCameraStatusConfigValueId'] }),
  touchscreen_status: Object.freeze({ properties: ['touchscreenStatusConfigValueId'] }),
  keyboard_language: Object.freeze({ properties: ['keyboardLanguageConfigValueId'] }),
  complete_diagnostics: Object.freeze({ properties: ['completeDiagnosticsStatusConfigValueId'] }),
  virus_check: Object.freeze({ properties: ['virusCheckStatusConfigValueId'] }),
  driver_check: Object.freeze({ properties: ['driverCheckStatusConfigValueId'] }),
  skinned_status: Object.freeze({ properties: ['skinnedStatusConfigValueId'] }),
  cosmetic_issues: Object.freeze({
    properties: ['cosmeticIssues'],
    repeatableType: 'cosmeticIssue'
  }),
  hardware_issues: Object.freeze({
    properties: ['hardwareIssues'],
    repeatableType: 'hardwareIssue'
  }),
  overall_grade: Object.freeze({ properties: ['overallGradeConfigValueId'] }),
  unit_outcome: Object.freeze({
    properties: [
      'outcomeCode',
      'outcomeApprovalRequested',
      'outcomeApprovalRequestNotes'
    ]
  }),
  overall_grade_notes: Object.freeze({ properties: ['overallGradeNotes'] }),
  outcome_notes: Object.freeze({ properties: ['outcomeNotes'] }),
  general_comment: Object.freeze({
    properties: ['generalCommentText', 'generalCommentTypeConfigValueId'],
    appendOnly: true
  })
});

const CONFIGURABLE_FIELDS = Object.freeze(
  UNIT_FORM_FIELD_REGISTRY.filter((field) => field.enabledForLotRules)
);

const CONFIGURABLE_FIELD_KEYS = Object.freeze(
  CONFIGURABLE_FIELDS.map((field) => field.key)
);

const CONFIGURABLE_FIELD_KEY_SET = new Set(CONFIGURABLE_FIELD_KEYS);

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)])
    );
  }

  return value;
}

function cloneFormData(formData = {}) {
  return Object.fromEntries(
    Object.entries(formData || {}).map(([key, value]) => [key, cloneValue(value)])
  );
}

function normalizeMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();

  if (!['create', 'edit'].includes(normalized)) {
    throw new Error('Unit form submission mode must be create or edit.');
  }

  return normalized;
}

function getResolvedField(profile, fieldKey) {
  if (!profile || !(profile.fieldsByKey instanceof Map)) {
    throw new Error('A resolved Lot Unit form profile is required.');
  }

  const field = profile.fieldsByKey.get(fieldKey);

  if (!field) {
    throw new Error(`Resolved Lot Unit form profile is missing ${fieldKey}.`);
  }

  return field;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeRows(rows) {
  if (Array.isArray(rows)) {
    return rows.filter((row) => row && typeof row === 'object');
  }

  if (rows && typeof rows === 'object') {
    return Object.keys(rows)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => rows[key])
      .filter((row) => row && typeof row === 'object');
  }

  return [];
}

function rowHasMeaningfulValue(row, ignoredKeys = []) {
  const ignored = new Set(ignoredKeys);

  return Object.entries(row || {}).some(([key, value]) => {
    if (ignored.has(key)) {
      return false;
    }

    return normalizeText(value) !== '';
  });
}

function hasMeaningfulMemoryValue(formData) {
  if (normalizeText(formData.ramGb) || normalizeText(formData.ramTypeConfigValueId)) {
    return true;
  }

  return normalizeRows(formData.memoryModules).some((row) => (
    rowHasMeaningfulValue(row, ['slotLabel'])
    || (normalizeText(row.slotLabel) && normalizeText(row.slotLabel).toLowerCase() !== 'slot 1')
  ));
}

function hasMeaningfulStorageValue(formData) {
  if (normalizeText(formData.storageGb) || normalizeText(formData.storageTypeConfigValueId)) {
    return true;
  }

  return normalizeRows(formData.storageDevices).some((row) => (
    rowHasMeaningfulValue(row, ['slotLabel'])
    || (normalizeText(row.slotLabel) && normalizeText(row.slotLabel).toLowerCase() !== 'drive 1')
  ));
}

function hasMeaningfulPreviousMemoryValue(formData) {
  if (normalizeText(formData.previousRamGb)) {
    return true;
  }

  return normalizeRows(formData.previousMemoryModules).some((row) => (
    rowHasMeaningfulValue(row, ['slotLabel'])
    || (normalizeText(row.slotLabel) && normalizeText(row.slotLabel).toLowerCase() !== 'slot 1')
  ));
}

function hasMeaningfulPreviousStorageValue(formData) {
  if (normalizeText(formData.previousStorageGb)) {
    return true;
  }

  return normalizeRows(formData.previousStorageDevices).some((row) => (
    rowHasMeaningfulValue(row, ['slotLabel'])
    || (normalizeText(row.slotLabel) && normalizeText(row.slotLabel).toLowerCase() !== 'drive 1')
  ));
}

function hasMeaningfulRepeatableValue(formData, fieldKey) {
  if (fieldKey === 'memory_modules') {
    return hasMeaningfulMemoryValue(formData);
  }

  if (fieldKey === 'storage_devices') {
    return hasMeaningfulStorageValue(formData);
  }

  if (fieldKey === 'cosmetic_issues') {
    return normalizeRows(formData.cosmeticIssues).some((row) => rowHasMeaningfulValue(row));
  }

  if (fieldKey === 'hardware_issues') {
    return normalizeRows(formData.hardwareIssues).some((row) => rowHasMeaningfulValue(row));
  }

  return false;
}

function hasMeaningfulFieldValue(formData, fieldKey) {
  const binding = FIELD_BINDINGS[fieldKey];

  if (!binding) {
    return false;
  }

  if (fieldKey === 'previous_memory_size') {
    return hasMeaningfulPreviousMemoryValue(formData);
  }

  if (fieldKey === 'previous_storage_size') {
    return hasMeaningfulPreviousStorageValue(formData);
  }

  if (binding.repeatableType) {
    return hasMeaningfulRepeatableValue(formData, fieldKey);
  }

  if (binding.appendOnly) {
    const contentProperty = binding.properties[0];
    return normalizeText(formData[contentProperty]) !== '';
  }

  return binding.properties.some((propertyName) => {
    const value = formData[propertyName];

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return normalizeText(value) !== '';
  });
}

function hasCompleteRequiredFieldValue(formData, fieldKey) {
  if (fieldKey === 'memory_modules') {
    return normalizeRows(formData.memoryModules).some((row) => {
      const normalizedSize = normalizeText(row.sizeGb);
      const size = Number(normalizedSize);
      return normalizedSize !== '' && Number.isInteger(size) && size >= 0;
    });
  }

  if (fieldKey === 'storage_devices') {
    return normalizeRows(formData.storageDevices).some((row) => {
      const normalizedSize = normalizeText(row.sizeGb);
      const size = Number(normalizedSize);
      return normalizedSize !== '' && Number.isInteger(size) && size >= 0;
    });
  }

  if (fieldKey === 'cosmetic_issues') {
    return normalizeRows(formData.cosmeticIssues).some((row) => Boolean(
      normalizeText(row.issueTypeConfigValueId)
      && (
        normalizeText(row.isNoIssue) === '1'
        || (
          normalizeText(row.severityConfigValueId)
          && normalizeText(row.locationConfigValueId)
        )
      )
    ));
  }

  if (fieldKey === 'hardware_issues') {
    return normalizeRows(formData.hardwareIssues).some((row) => {
      const issueTypeConfigValueId = normalizeText(row.issueTypeConfigValueId);
      const isNoIssue = normalizeText(row.isNoIssue) === '1';

      if (isNoIssue) {
        return Boolean(issueTypeConfigValueId);
      }

      return Boolean(issueTypeConfigValueId || normalizeText(row.customIssueLabel));
    });
  }

  const binding = FIELD_BINDINGS[fieldKey];

  if (!binding) {
    return true;
  }

  const primaryProperty = binding.properties[0];
  const value = formData[primaryProperty];

  if (typeof value === 'boolean') {
    return value;
  }

  return normalizeText(value) !== '';
}

function getRequiredMessage(field) {
  if (field.key === 'memory_modules') {
    return 'Add at least one complete memory module with a positive size.';
  }

  if (field.key === 'storage_devices') {
    return 'Add at least one complete storage device with a positive size.';
  }

  if (field.key === 'cosmetic_issues') {
    return 'Choose a cosmetic issue with severity and location, or choose None when there is no cosmetic issue.';
  }

  if (field.key === 'hardware_issues') {
    return 'Choose a hardware issue, enter a custom issue, or choose None when there is no hardware issue.';
  }

  return `${field.label} is required by the selected Lot.`;
}

function clearPropertyValue(formData, propertyName) {
  if (Array.isArray(formData[propertyName])) {
    formData[propertyName] = [];
    return;
  }

  if (typeof formData[propertyName] === 'boolean') {
    formData[propertyName] = false;
    return;
  }

  formData[propertyName] = '';
}

function clearFieldProperties(formData, fieldKey) {
  const binding = FIELD_BINDINGS[fieldKey];

  if (!binding) {
    return;
  }

  binding.properties.forEach((propertyName) => clearPropertyValue(formData, propertyName));
}

function preserveFieldProperties(formData, existingFormData, fieldKey) {
  const binding = FIELD_BINDINGS[fieldKey];

  if (!binding) {
    return;
  }

  binding.properties.forEach((propertyName) => {
    if (Object.prototype.hasOwnProperty.call(existingFormData || {}, propertyName)) {
      formData[propertyName] = cloneValue(existingFormData[propertyName]);
      return;
    }

    clearPropertyValue(formData, propertyName);
  });
}

function buildPolicyMetadata({ mode, profile, managedFieldKeys, hiddenFieldKeys, requiredFieldKeys }) {
  return Object.freeze({
    mode,
    lotId: Number(profile.selectedLot.lotId),
    managedFieldKeys: Object.freeze([...managedFieldKeys]),
    hiddenFieldKeys: Object.freeze([...hiddenFieldKeys]),
    requiredFieldKeys: Object.freeze([...requiredFieldKeys])
  });
}

function applyUnitFormSubmissionPolicy({
  mode,
  submittedFormData,
  existingFormData = null,
  profile
} = {}) {
  const normalizedMode = normalizeMode(mode);
  const formData = cloneFormData(submittedFormData || {});
  const managedFieldKeys = [];
  const hiddenFieldKeys = [];
  const requiredFieldKeys = [];
  const errors = [];
  const fieldErrors = [];

  if (normalizedMode === 'edit' && (!existingFormData || typeof existingFormData !== 'object')) {
    throw new Error('Existing Unit form data is required when enforcing an Edit submission.');
  }

  CONFIGURABLE_FIELDS.forEach((registryField) => {
    const resolvedField = getResolvedField(profile, registryField.key);

    if (resolvedField.visible) {
      managedFieldKeys.push(registryField.key);

      if (resolvedField.required) {
        requiredFieldKeys.push(registryField.key);

        if (!hasCompleteRequiredFieldValue(formData, registryField.key)) {
          const message = getRequiredMessage(registryField);
          errors.push(message);
          fieldErrors.push(Object.freeze({
            fieldKey: registryField.key,
            label: registryField.label,
            code: 'required',
            message
          }));
        }
      }

      return;
    }

    hiddenFieldKeys.push(registryField.key);

    if (normalizedMode === 'create') {
      if (hasMeaningfulFieldValue(formData, registryField.key)) {
        const message = `${registryField.label} is hidden by the selected Lot. Its submitted value was removed; review the form and save again.`;
        errors.push(message);
        fieldErrors.push(Object.freeze({
          fieldKey: registryField.key,
          label: registryField.label,
          code: 'hidden_create_value',
          message
        }));
      }

      clearFieldProperties(formData, registryField.key);
      return;
    }

    preserveFieldProperties(formData, existingFormData, registryField.key);
  });

  formData[POLICY_METADATA_KEY] = buildPolicyMetadata({
    mode: normalizedMode,
    profile,
    managedFieldKeys,
    hiddenFieldKeys,
    requiredFieldKeys
  });

  return Object.freeze({
    formData,
    errors: Object.freeze(errors),
    fieldErrors: Object.freeze(fieldErrors),
    managedFieldKeys: Object.freeze(managedFieldKeys),
    hiddenFieldKeys: Object.freeze(hiddenFieldKeys),
    requiredFieldKeys: Object.freeze(requiredFieldKeys)
  });
}

function getUnitFormSubmissionPolicy(formData) {
  const policy = formData && formData[POLICY_METADATA_KEY];

  return policy && typeof policy === 'object' ? policy : null;
}

function isUnitFormFieldManaged(formData, fieldKey) {
  if (!CONFIGURABLE_FIELD_KEY_SET.has(fieldKey)) {
    return true;
  }

  const policy = getUnitFormSubmissionPolicy(formData);

  if (!policy || !Array.isArray(policy.managedFieldKeys)) {
    return true;
  }

  return policy.managedFieldKeys.includes(fieldKey);
}

function isAnyUnitFormFieldManaged(formData, fieldKeys) {
  return (Array.isArray(fieldKeys) ? fieldKeys : []).some((fieldKey) => (
    isUnitFormFieldManaged(formData, fieldKey)
  ));
}

function buildManagedValidationFormData(formData = {}) {
  const validationFormData = cloneFormData(formData);
  const policy = getUnitFormSubmissionPolicy(formData);

  if (!policy || !Array.isArray(policy.hiddenFieldKeys)) {
    return validationFormData;
  }

  policy.hiddenFieldKeys.forEach((fieldKey) => clearFieldProperties(validationFormData, fieldKey));
  return validationFormData;
}

function assertUnitFormSubmissionPolicyBindings() {
  const missingBindings = CONFIGURABLE_FIELDS
    .filter((field) => !FIELD_BINDINGS[field.key])
    .map((field) => field.key);

  const unknownBindings = Object.keys(FIELD_BINDINGS)
    .filter((fieldKey) => !CONFIGURABLE_FIELD_KEY_SET.has(fieldKey));

  if (missingBindings.length > 0) {
    throw new Error(`Missing Unit form submission bindings: ${missingBindings.join(', ')}`);
  }

  if (unknownBindings.length > 0) {
    throw new Error(`Unknown Unit form submission bindings: ${unknownBindings.join(', ')}`);
  }

  CONFIGURABLE_FIELDS.forEach((field) => {
    const binding = FIELD_BINDINGS[field.key];

    if (!Array.isArray(binding.properties) || binding.properties.length === 0) {
      throw new Error(`Unit form submission binding ${field.key} must define at least one property.`);
    }

    if (field.ruleType === RULE_TYPE.REPEATABLE_SECTION && !binding.repeatableType) {
      throw new Error(`Repeatable Unit form submission binding ${field.key} must define repeatableType.`);
    }
  });

  return true;
}

assertUnitFormSubmissionPolicyBindings();

module.exports = {
  CONFIGURABLE_FIELD_KEYS,
  FIELD_BINDINGS,
  POLICY_METADATA_KEY,
  applyUnitFormSubmissionPolicy,
  assertUnitFormSubmissionPolicyBindings,
  buildManagedValidationFormData,
  getUnitFormSubmissionPolicy,
  hasCompleteRequiredFieldValue,
  hasMeaningfulFieldValue,
  isAnyUnitFormFieldManaged,
  isUnitFormFieldManaged
};
