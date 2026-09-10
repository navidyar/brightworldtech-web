'use strict';

const TOOL_POLICY_FIELDS = Object.freeze({
  allowManualCreateUpdate: Object.freeze({
    column: 'allow_manual_create_update',
    defaultValue: true,
    label: 'Allow Manual Create/Update'
  }),
  allowScanTools: Object.freeze({
    column: 'allow_scantools',
    defaultValue: true,
    label: 'Allow ScanTools'
  }),
  allowTechTools: Object.freeze({
    column: 'allow_techtools',
    defaultValue: true,
    label: 'Allow TechTools'
  }),
  requireScanToolsBeforeCompletion: Object.freeze({
    column: 'require_scantools_before_completion',
    defaultValue: false,
    label: 'Require ScanTools Before Completion'
  }),
  requireTechToolsBeforeCompletion: Object.freeze({
    column: 'require_techtools_before_completion',
    defaultValue: false,
    label: 'Require TechTools Before Completion'
  })
});

const TOOL_POLICY_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.entries(TOOL_POLICY_FIELDS).map(([key, definition]) => [key, definition.defaultValue])
));

function normalizeDirectValue(value) {
  if (value === null || value === undefined || String(value).trim() === '' || String(value).trim() === 'inherit') return null;
  if (value === true || value === 1 || String(value).trim() === '1') return true;
  if (value === false || value === 0 || String(value).trim() === '0') return false;
  return null;
}

function toStoredValue(value) {
  const normalized = normalizeDirectValue(value);
  return normalized === null ? null : (normalized ? 1 : 0);
}

function toFormValue(value) {
  const normalized = normalizeDirectValue(value);
  if (normalized === null) return 'inherit';
  return normalized ? '1' : '0';
}

function directPolicyFromRow(row = {}) {
  return Object.fromEntries(Object.entries(TOOL_POLICY_FIELDS).map(([key, definition]) => [
    key,
    normalizeDirectValue(row[definition.column])
  ]));
}

function directPolicyFromFormData(formData = {}) {
  return Object.fromEntries(Object.keys(TOOL_POLICY_FIELDS).map((key) => [
    key,
    normalizeDirectValue(formData[key])
  ]));
}

function applyDirectPolicy(directPolicy = {}, inheritedPolicy = TOOL_POLICY_DEFAULTS) {
  return Object.fromEntries(Object.keys(TOOL_POLICY_FIELDS).map((key) => {
    const direct = normalizeDirectValue(directPolicy[key]);
    return [key, direct === null ? Boolean(inheritedPolicy[key]) : direct];
  }));
}

function resolveLotToolPolicy(rows = [], lotId) {
  const rowMap = new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.lot_id), row]));
  const chain = [];
  const visited = new Set();
  let current = rowMap.get(Number(lotId)) || null;

  while (current) {
    const currentId = Number(current.lot_id);
    if (!Number.isSafeInteger(currentId) || currentId <= 0 || visited.has(currentId)) break;
    visited.add(currentId);
    chain.push(current);
    const parentId = Number(current.parent_lot_id);
    current = Number.isSafeInteger(parentId) && parentId > 0 ? rowMap.get(parentId) || null : null;
  }

  let effective = { ...TOOL_POLICY_DEFAULTS };
  for (const row of chain.reverse()) {
    effective = applyDirectPolicy(directPolicyFromRow(row), effective);
  }

  return effective;
}

function validateEffectivePolicy(effective = {}) {
  const errors = [];
  if (effective.requireScanToolsBeforeCompletion && !effective.allowScanTools) {
    errors.push('ScanTools cannot be required before completion while ScanTools is disallowed for the Lot.');
  }
  if (effective.requireTechToolsBeforeCompletion && !effective.allowTechTools) {
    errors.push('TechTools cannot be required before completion while TechTools is disallowed for the Lot.');
  }
  return errors;
}

module.exports = {
  TOOL_POLICY_FIELDS,
  TOOL_POLICY_DEFAULTS,
  normalizeDirectValue,
  toStoredValue,
  toFormValue,
  directPolicyFromRow,
  directPolicyFromFormData,
  applyDirectPolicy,
  resolveLotToolPolicy,
  validateEffectivePolicy
};
