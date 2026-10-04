'use strict';

const VALID_OVERRIDE_EFFECTS = new Set(['allow', 'deny']);

function normalizePermissionKey(value) {
  return String(value || '').trim();
}

function normalizePermissionKeys(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizePermissionKey).filter(Boolean))];
}

function normalizeUserOverrides(overrides) {
  if (!Array.isArray(overrides)) return [];

  return overrides.map((override) => {
    const permissionKey = normalizePermissionKey(override && (override.permissionKey ?? override.permission_key));
    const effect = String(override && override.effect || '').trim().toLowerCase();

    if (!permissionKey) {
      throw new Error('Permission override is missing a permission key.');
    }
    if (!VALID_OVERRIDE_EFFECTS.has(effect)) {
      throw new Error(`Invalid permission override effect for ${permissionKey}: ${effect || '(blank)'}`);
    }

    return { permissionKey, effect };
  });
}

function resolveEffectivePermissions({ rolePermissionKeys = [], userOverrides = [] } = {}) {
  const effectivePermissions = new Set(normalizePermissionKeys(rolePermissionKeys));

  for (const override of normalizeUserOverrides(userOverrides)) {
    if (override.effect === 'allow') effectivePermissions.add(override.permissionKey);
    if (override.effect === 'deny') effectivePermissions.delete(override.permissionKey);
  }

  return effectivePermissions;
}

function hasPermission(permissionSet, permissionKey) {
  if (!(permissionSet instanceof Set)) return false;
  const normalizedKey = normalizePermissionKey(permissionKey);
  return Boolean(normalizedKey) && permissionSet.has(normalizedKey);
}

function hasAnyPermission(permissionSet, permissionKeys) {
  return normalizePermissionKeys(permissionKeys).some((permissionKey) => hasPermission(permissionSet, permissionKey));
}

function hasAllPermissions(permissionSet, permissionKeys) {
  return normalizePermissionKeys(permissionKeys).every((permissionKey) => hasPermission(permissionSet, permissionKey));
}

module.exports = {
  VALID_OVERRIDE_EFFECTS,
  normalizePermissionKey,
  normalizePermissionKeys,
  normalizeUserOverrides,
  resolveEffectivePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions
};
