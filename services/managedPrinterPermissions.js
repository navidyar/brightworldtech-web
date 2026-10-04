'use strict';

function hasPermission(permissions, key) {
  return permissions instanceof Set && permissions.has(key);
}

function canManageRegistryPrinter(permissions, printer) {
  if (!printer) return false;
  if (printer.scope_code === 'managed') return hasPermission(permissions, 'printers.managed.manage');
  if (printer.scope_code === 'solo') return hasPermission(permissions, 'printers.solo.manage_any');
  return false;
}

function canConvertPrinterScope(permissions) {
  return hasPermission(permissions, 'printers.managed.manage')
    && hasPermission(permissions, 'printers.solo.manage_any');
}

function canViewOtherPrinterNetworkDetails(permissions) {
  return hasPermission(permissions, 'printers.network_details.view');
}

function canManageAnySoloPrinter(permissions) {
  return hasPermission(permissions, 'printers.solo.manage_any');
}

module.exports = { canManageRegistryPrinter, canConvertPrinterScope, canViewOtherPrinterNetworkDetails, canManageAnySoloPrinter };
