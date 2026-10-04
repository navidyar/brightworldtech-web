'use strict';

const { LABEL_FIELD_GROUPS, LABEL_FIELDS, findLabelField } = require('../config/labelFieldRegistry');

function normalizeStoredSettings(rows = []) {
  const byKey = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const fieldKey = String(row?.field_key || row?.fieldKey || '').trim();
    if (!fieldKey || !findLabelField(fieldKey)) continue;
    byKey.set(fieldKey, {
      fieldKey,
      displayLabel: String(row?.display_label ?? row?.displayLabel ?? '').trim(),
      isActive: row?.is_active === undefined && row?.isActive === undefined
        ? true
        : Boolean(Number(row?.is_active ?? row?.isActive)),
      sortOrder: Number.isFinite(Number(row?.sort_order ?? row?.sortOrder))
        ? Number(row?.sort_order ?? row?.sortOrder)
        : null
    });
  }

  return byKey;
}

function buildConfiguredLabelFieldGroups(rows = [], options = {}) {
  const includeInactive = options.includeInactive === true;
  const includeKeys = new Set((options.includeKeys || []).map((value) => String(value || '').trim()).filter(Boolean));
  const storedByKey = normalizeStoredSettings(rows);

  return LABEL_FIELD_GROUPS.map((group) => {
    const fields = group.fields.map((field, index) => {
      const stored = storedByKey.get(field.key);
      return {
        ...field,
        defaultLabel: field.label,
        label: stored?.displayLabel || field.label,
        isActive: stored ? stored.isActive : true,
        sortOrder: stored?.sortOrder ?? ((index + 1) * 10),
        groupCode: group.code,
        groupLabel: group.label
      };
    }).sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.label.localeCompare(right.label)
      || left.key.localeCompare(right.key)
    )).filter((field) => includeInactive || field.isActive || includeKeys.has(field.key));

    return {
      code: group.code,
      label: group.label,
      fields
    };
  }).filter((group) => group.fields.length > 0);
}

function configureComposedValuePresets(presets = {}, configuredGroups = []) {
  const fields = configuredGroups.flatMap((group) => group.fields || []);
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const activeKeys = new Set(fields.filter((field) => field.isActive).map((field) => field.key));

  const transformGroup = (entries) => (Array.isArray(entries) ? entries : []).filter((preset) => {
    const fieldParts = (Array.isArray(preset?.parts) ? preset.parts : []).filter((part) => part?.type === 'field');
    return fieldParts.every((part) => activeKeys.has(String(part.field || '').trim()));
  }).map((preset) => ({
    ...preset,
    label: (Array.isArray(preset.parts) ? preset.parts : []).map((part) => {
      if (part?.type === 'field') return fieldByKey.get(String(part.field || '').trim())?.label || String(part.field || '');
      return String(part?.value || '');
    }).join('').replace(/\s+/g, ' ').trim().slice(0, 120) || preset.label
  }));

  return {
    common: transformGroup(presets.common),
    recent: transformGroup(presets.recent),
    starter: transformGroup(presets.starter)
  };
}

function buildLabelDynamicFieldUpdateItems({ fieldKeys = [], displayLabels = [], activeFieldKeys = [] } = {}) {
  const keys = Array.isArray(fieldKeys) ? fieldKeys : [fieldKeys];
  const labels = Array.isArray(displayLabels) ? displayLabels : [displayLabels];
  const activeSet = new Set((Array.isArray(activeFieldKeys) ? activeFieldKeys : [activeFieldKeys])
    .map((value) => String(value || '').trim())
    .filter(Boolean));
  const supportedKeys = new Set(LABEL_FIELDS.map((field) => field.key));
  const seen = new Set();
  const groupPositions = new Map();
  const items = [];

  for (let index = 0; index < keys.length; index += 1) {
    const fieldKey = String(keys[index] || '').trim();
    if (!supportedKeys.has(fieldKey) || seen.has(fieldKey)) continue;
    seen.add(fieldKey);
    const field = findLabelField(fieldKey);
    const groupCode = field.groupCode;
    const nextPosition = (groupPositions.get(groupCode) || 0) + 1;
    groupPositions.set(groupCode, nextPosition);
    items.push({
      fieldKey,
      displayLabel: String(labels[index] || '').trim(),
      isActive: activeSet.has(fieldKey),
      sortOrder: nextPosition * 10
    });
  }

  return items;
}

function buildLabelDynamicFieldOrderItems({ groupCode = '', fieldKeys = [] } = {}) {
  const normalizedGroupCode = String(groupCode || '').trim();
  const group = LABEL_FIELD_GROUPS.find((entry) => entry.code === normalizedGroupCode);
  const keys = (Array.isArray(fieldKeys) ? fieldKeys : [fieldKeys])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!group) {
    return {
      groupCode: normalizedGroupCode,
      items: [],
      errors: ['Choose a valid Label Builder Dynamic Field group.']
    };
  }

  const expectedKeys = group.fields.map((field) => field.key);
  const expectedSet = new Set(expectedKeys);
  const submittedSet = new Set(keys);
  const hasExactFieldSet = keys.length === expectedKeys.length
    && submittedSet.size === expectedSet.size
    && expectedKeys.every((fieldKey) => submittedSet.has(fieldKey))
    && keys.every((fieldKey) => expectedSet.has(fieldKey));

  if (!hasExactFieldSet) {
    return {
      groupCode: normalizedGroupCode,
      items: [],
      errors: ['The Label Builder field list changed while it was being reordered. Reload Configuration and try again.']
    };
  }

  return {
    groupCode: normalizedGroupCode,
    items: keys.map((fieldKey, index) => ({
      fieldKey,
      sortOrder: (index + 1) * 10
    })),
    errors: []
  };
}

function validateLabelDynamicFieldUpdateItems(items = []) {
  const errors = [];
  const expectedKeys = new Set(LABEL_FIELDS.map((field) => field.key));
  const submittedKeys = new Set(items.map((item) => item.fieldKey));

  if (submittedKeys.size !== expectedKeys.size || [...expectedKeys].some((key) => !submittedKeys.has(key))) {
    errors.push('The Label Builder field list changed while this form was open. Reload Configuration and try again.');
  }

  for (const item of items) {
    if (!item.displayLabel) errors.push(`${item.fieldKey} needs a display label.`);
    if (item.displayLabel.length > 120) errors.push(`${item.fieldKey} display label must be 120 characters or less.`);
  }

  return [...new Set(errors)];
}

module.exports = {
  buildConfiguredLabelFieldGroups,
  configureComposedValuePresets,
  buildLabelDynamicFieldUpdateItems,
  buildLabelDynamicFieldOrderItems,
  validateLabelDynamicFieldUpdateItems
};
