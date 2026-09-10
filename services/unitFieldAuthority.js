'use strict';

function normalizeSourceCode(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCycleKey(value) {
  return String(value || '').trim();
}

function isActiveManualOverride({ sourceCode = '', overrideProductionCycleKey = '' } = {}, currentProductionCycleKey = '') {
  const source = normalizeSourceCode(sourceCode);
  const overrideKey = normalizeCycleKey(overrideProductionCycleKey);
  const currentKey = normalizeCycleKey(currentProductionCycleKey);
  return source === 'manual_override' && Boolean(overrideKey) && overrideKey === currentKey;
}

function effectiveSourceCode(sourceState = {}, currentProductionCycleKey = '') {
  const source = normalizeSourceCode(sourceState.sourceCode);
  if (source !== 'manual_override') return source;
  return isActiveManualOverride(sourceState, currentProductionCycleKey)
    ? 'manual_override'
    : 'expired_manual_override';
}

function isReplaceableManualSource(sourceCode) {
  const source = normalizeSourceCode(sourceCode);
  return source === 'tech_edit' || source === 'expired_manual_override';
}

module.exports = {
  normalizeSourceCode,
  isActiveManualOverride,
  effectiveSourceCode,
  isReplaceableManualSource
};
