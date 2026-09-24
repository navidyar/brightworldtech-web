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
    return Object.freeze({
      fieldKey,
      locked: false,
      toolOwned,
      reason: toolOwned ? 'tool_populated_editable' : 'manual_allowed'
    });
  }

  return Object.freeze({
    lotRequiresTools,
    productionCycleKey: String(productionCycleKey || '').trim() || null,
    memory: buildField(CURRENT_MEMORY_FIELD_KEY),
    storage: buildField(CURRENT_STORAGE_FIELD_KEY)
  });
}


function applyCurrentHardwareAuthorityToSubmission({ formData = {} } = {}) {
  return { ...formData };
}

module.exports = {
  CURRENT_MEMORY_FIELD_KEY,
  CURRENT_STORAGE_FIELD_KEY,
  buildCurrentHardwareFormAuthority,
  applyCurrentHardwareAuthorityToSubmission
};
