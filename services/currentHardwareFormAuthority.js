'use strict';

const CURRENT_MEMORY_FIELD_KEY = 'memory_modules';
const CURRENT_STORAGE_FIELD_KEY = 'storage_devices';

function buildCurrentHardwareFormAuthority({
  effectiveToolPolicy = {},
  toolOwnedFieldKeys = [],
  productionCycleKey = null
} = {}) {
  const owned = new Set(Array.isArray(toolOwnedFieldKeys) ? toolOwnedFieldKeys.map((value) => String(value || '').trim()) : []);
  const lotRequiresTools = effectiveToolPolicy.requireScanToolsBeforeCompletion === true
    || effectiveToolPolicy.requireTechToolsBeforeCompletion === true;

  function buildField(fieldKey) {
    const toolOwned = owned.has(fieldKey);
    const locked = lotRequiresTools || toolOwned;
    return Object.freeze({
      fieldKey,
      locked,
      toolOwned,
      reason: lotRequiresTools
        ? 'lot_requires_tools'
        : (toolOwned ? 'tool_populated_current_cycle' : 'manual_allowed')
    });
  }

  return Object.freeze({
    lotRequiresTools,
    productionCycleKey: String(productionCycleKey || '').trim() || null,
    memory: buildField(CURRENT_MEMORY_FIELD_KEY),
    storage: buildField(CURRENT_STORAGE_FIELD_KEY)
  });
}


function applyCurrentHardwareAuthorityToSubmission({ formData = {}, existingFormData = null, authority = null, mode = 'create' } = {}) {
  const result = { ...formData };
  const existing = existingFormData || {};
  const isEdit = mode === 'edit';

  if (authority?.memory?.locked) {
    result.ramGb = isEdit ? existing.ramGb : '';
    result.ramTypeConfigValueId = isEdit ? existing.ramTypeConfigValueId : '';
    result.memoryModules = isEdit && Array.isArray(existing.memoryModules) ? existing.memoryModules : [];
  }

  if (authority?.storage?.locked) {
    result.storageGb = isEdit ? existing.storageGb : '';
    result.storageTypeConfigValueId = isEdit ? existing.storageTypeConfigValueId : '';
    result.storageDevices = isEdit && Array.isArray(existing.storageDevices) ? existing.storageDevices : [];
  }

  return result;
}

module.exports = {
  CURRENT_MEMORY_FIELD_KEY,
  CURRENT_STORAGE_FIELD_KEY,
  buildCurrentHardwareFormAuthority,
  applyCurrentHardwareAuthorityToSubmission
};
