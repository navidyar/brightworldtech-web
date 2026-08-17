'use strict';

// Numeric system identities are immutable application contracts. They point to the
// live config_category_id/config_value_id rows through the system_config_* tables.
// Legacy codes are used only by the one-time migration to establish those bindings.
const SYSTEM_CONFIG_CATEGORY_IDS = Object.freeze({
  UNIT_CATEGORIES: 1,
  UNIT_STATUSES: 2,
  RAM_TYPES: 3,
  STORAGE_TYPES: 4,
  STORAGE_WIPE_STATUSES: 5,
  OPERATING_SYSTEMS: 6,
  COSMETIC_GRADES: 7,
  ABSOLUTE_STATUSES: 8,
  CAMERA_STATUSES: 9,
  TOUCHSCREEN_STATUSES: 10,
  KEYBOARD_LANGUAGES: 11,
  DIAGNOSTICS_STATUSES: 12,
  VIRUS_CHECK_STATUSES: 13,
  DRIVER_CHECK_STATUSES: 14,
  SKINNED_STATUSES: 15,
  GPU_TYPES: 16,
  COSMETIC_ISSUE_TYPES: 17,
  HARDWARE_ISSUE_TYPES: 18,
  ISSUE_LOCATIONS: 19,
  ISSUE_SEVERITIES: 20,
  COMMENT_TYPES: 21,
  LOT_TYPES: 22,
  LOT_STATUSES: 23,
  LOT_REQUIREMENT_TYPES: 24,
  COMPARISON_OPERATORS: 25,
  LOT_REQUIREMENT_POLICIES: 26,
  PRODUCTION_WEIGHT_TYPES: 27,
  UNIT_IDENTIFIER_TYPES: 28,
  OVERRIDE_STATUSES: 29,
  ACCOUNT_STATUSES: 30,
  SECURITY_SETTINGS: 31,
  PASSWORD_LINK_TYPES: 32
});

const CATEGORY_BINDINGS = Object.freeze([
  [SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, 'Unit Categories', ['unit_categories', 'unit_category', 'unit_types', 'unit_type']],
  [SYSTEM_CONFIG_CATEGORY_IDS.UNIT_STATUSES, 'Unit Statuses', ['unit_statuses', 'unit_status', 'current_unit_statuses', 'current_unit_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES, 'Memory Types', ['ram_types', 'ram_type']],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'Storage Types', ['storage_types', 'storage_type', 'ssd_types', 'ssd_type']],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_WIPE_STATUSES, 'Storage Wipe Statuses', ['storage_wipe_statuses', 'storage_wipe_status', 'wipe_statuses', 'wipe_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.OPERATING_SYSTEMS, 'Operating Systems', ['operating_systems', 'operating_system']],
  [SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES, 'Cosmetic Grades', ['cosmetic_grades', 'overall_unit_grades', 'unit_grades', 'unit_grade', 'grades']],
  [SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES, 'Absolute Statuses', ['absolute_statuses', 'absolute_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.CAMERA_STATUSES, 'Camera Statuses', ['physical_camera_statuses', 'camera_statuses', 'physical_camera_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES, 'Touchscreen Statuses', ['touchscreen_statuses', 'touchscreen_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'Keyboard Languages', ['keyboard_languages', 'keyboard_language']],
  [SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES, 'Diagnostics Statuses', ['diagnostics_statuses', 'complete_diagnostics_statuses', 'diagnostics_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES, 'Virus Check Statuses', ['virus_check_statuses', 'virus_check_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.DRIVER_CHECK_STATUSES, 'Driver Check Statuses', ['driver_check_statuses', 'driver_check_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.SKINNED_STATUSES, 'Skinned Statuses', ['skinned_statuses', 'skinned_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.GPU_TYPES, 'Graphics Adapter Types', ['gpu_types', 'gpu_type', 'graphics_adapter_types']],
  [SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_ISSUE_TYPES, 'Cosmetic Issue Types', ['cosmetic_issue_types', 'cosmetic_issue_type', 'cosmetic_issues']],
  [SYSTEM_CONFIG_CATEGORY_IDS.HARDWARE_ISSUE_TYPES, 'Hardware Issue Types', ['hardware_issue_types', 'hardware_issue_type', 'hardware_issues']],
  [SYSTEM_CONFIG_CATEGORY_IDS.ISSUE_LOCATIONS, 'Issue Locations', ['issue_locations', 'issue_location', 'unit_issue_locations']],
  [SYSTEM_CONFIG_CATEGORY_IDS.ISSUE_SEVERITIES, 'Issue Severities', ['issue_severities', 'issue_severity', 'unit_issue_severities']],
  [SYSTEM_CONFIG_CATEGORY_IDS.COMMENT_TYPES, 'Unit Comment Types', ['unit_comment_types', 'comment_types', 'note_types']],
  [SYSTEM_CONFIG_CATEGORY_IDS.LOT_TYPES, 'Lot Types', ['lot_types', 'lot_type']],
  [SYSTEM_CONFIG_CATEGORY_IDS.LOT_STATUSES, 'Lot Statuses', ['lot_statuses', 'lot_status']],
  [SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_TYPES, 'Lot Requirement Types', ['lot_requirement_types']],
  [SYSTEM_CONFIG_CATEGORY_IDS.COMPARISON_OPERATORS, 'Comparison Operators', ['comparison_operators']],
  [SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES, 'Lot Requirement Policies', ['lot_requirement_policies', 'lot_requirement_policy']],
  [SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES, 'Production Weight Types', ['production_weight_types', 'production_weights']],
  [SYSTEM_CONFIG_CATEGORY_IDS.UNIT_IDENTIFIER_TYPES, 'Unit Identifier Types', ['unit_identifier_types']],
  [SYSTEM_CONFIG_CATEGORY_IDS.OVERRIDE_STATUSES, 'Override Statuses', ['override_statuses']],
  [SYSTEM_CONFIG_CATEGORY_IDS.ACCOUNT_STATUSES, 'Account Statuses', ['account_statuses']],
  [SYSTEM_CONFIG_CATEGORY_IDS.SECURITY_SETTINGS, 'Security Settings', ['security_settings']],
  [SYSTEM_CONFIG_CATEGORY_IDS.PASSWORD_LINK_TYPES, 'Password Link Types', ['password_link_types']]
].map(([systemId, name, legacyCodes]) => Object.freeze({ systemId, name, legacyCodes: Object.freeze(legacyCodes) })));

const SYSTEM_CONFIG_VALUE_IDS = Object.freeze({
  ACCOUNT_ACTIVE: 101,
  ACCOUNT_PENDING_SETUP: 102,
  PASSWORD_LINK_SETUP: 111,
  PASSWORD_LINK_RESET: 112,
  PASSWORD_LINK_EXPIRY_HOURS: 121,

  IDENTIFIER_ASSET_TAG: 201,
  IDENTIFIER_UNIT_SERIAL: 202,
  IDENTIFIER_BIOS_SERIAL: 203,
  UNIT_STATUS_RECEIVED: 211,
  LOT_STATUS_DEFAULT: 221,
  COMMENT_GENERAL: 231,
  COSMETIC_ISSUE_NONE: 241,
  HARDWARE_ISSUE_NONE: 242,

  OVERRIDE_APPROVED: 251,
  OVERRIDE_CANCELLED: 252,
  OVERRIDE_EXPIRED: 253,

  REQUIREMENT_UNIT_SERIAL: 301,
  REQUIREMENT_BIOS_SERIAL: 302,
  REQUIREMENT_UNIT_TYPE: 303,
  REQUIREMENT_MANUFACTURER: 304,
  REQUIREMENT_MODEL: 305,
  REQUIREMENT_PROCESSOR: 306,
  REQUIREMENT_PROCESSOR_FAMILY: 307,
  REQUIREMENT_PROCESSOR_SPEED_GHZ: 308,
  REQUIREMENT_RAM_GB: 309,
  REQUIREMENT_RAM_TYPE: 310,
  REQUIREMENT_MEMORY_INSTALL_TYPE: 311,
  REQUIREMENT_STORAGE_GB: 312,
  REQUIREMENT_STORAGE_TYPE: 313,
  REQUIREMENT_STORAGE_WIPE_STATUS: 314,
  REQUIREMENT_OPERATING_SYSTEM: 315,
  REQUIREMENT_OS_BUILD: 316,
  REQUIREMENT_BIOS_VERSION: 317,
  REQUIREMENT_BATTERY_HEALTH: 318,
  REQUIREMENT_ABSOLUTE_STATUS: 319,
  REQUIREMENT_PHYSICAL_CAMERA_STATUS: 320,
  REQUIREMENT_TOUCHSCREEN_STATUS: 321,
  REQUIREMENT_KEYBOARD_LANGUAGE: 322,
  REQUIREMENT_COMPLETE_DIAGNOSTICS: 323,
  REQUIREMENT_VIRUS_CHECK: 324,
  REQUIREMENT_DRIVER_CHECK: 325,
  REQUIREMENT_SKINNED_STATUS: 326,
  REQUIREMENT_OVERALL_GRADE: 327,
  REQUIREMENT_UNIT_OUTCOME: 328,

  OPERATOR_EQUALS: 351,
  OPERATOR_GREATER_EQUAL: 352,
  OPERATOR_LESS_EQUAL: 353,

  POLICY_STRICT: 371,
  POLICY_WARN_ONLY: 372,
  POLICY_OPEN_MIXED: 373,

  UNIT_CATEGORY_LAPTOP: 401,
  UNIT_CATEGORY_DESKTOP: 402,
  UNIT_CATEGORY_MACBOOK: 403,
  UNIT_CATEGORY_WINDOWS_SURFACE: 404,
  UNIT_CATEGORY_ELS: 405,
  UNIT_CATEGORY_CONFIGURATION_TASK: 406,
  UNIT_CATEGORY_CHROME: 407,

  PRODUCTION_WEIGHT_LAPTOP: 421,
  PRODUCTION_WEIGHT_DESKTOP: 422,
  PRODUCTION_WEIGHT_MAC: 423,
  PRODUCTION_WEIGHT_WINDOWS_SURFACE: 424,
  PRODUCTION_WEIGHT_ELS: 425,
  PRODUCTION_WEIGHT_CONFIGURATION_TASK: 426,

  COSMETIC_GRADE_A: 501,
  COSMETIC_GRADE_AB: 502,
  COSMETIC_GRADE_B: 503,
  COSMETIC_GRADE_C: 504,
  COSMETIC_GRADE_D: 505
});

const requirementValues = [
  ['REQUIREMENT_UNIT_SERIAL', 'unit_serial_number'],
  ['REQUIREMENT_BIOS_SERIAL', 'bios_serial_number'],
  ['REQUIREMENT_UNIT_TYPE', 'unit_type'],
  ['REQUIREMENT_MANUFACTURER', 'manufacturer'],
  ['REQUIREMENT_MODEL', 'model'],
  ['REQUIREMENT_PROCESSOR', 'processor'],
  ['REQUIREMENT_PROCESSOR_FAMILY', 'processor_family'],
  ['REQUIREMENT_PROCESSOR_SPEED_GHZ', 'processor_speed_ghz'],
  ['REQUIREMENT_RAM_GB', 'ram_gb'],
  ['REQUIREMENT_RAM_TYPE', 'ram_type'],
  ['REQUIREMENT_MEMORY_INSTALL_TYPE', 'memory_install_type'],
  ['REQUIREMENT_STORAGE_GB', 'storage_gb'],
  ['REQUIREMENT_STORAGE_TYPE', 'storage_type'],
  ['REQUIREMENT_STORAGE_WIPE_STATUS', 'storage_wipe_status'],
  ['REQUIREMENT_OPERATING_SYSTEM', 'operating_system'],
  ['REQUIREMENT_OS_BUILD', 'os_build'],
  ['REQUIREMENT_BIOS_VERSION', 'bios_version'],
  ['REQUIREMENT_BATTERY_HEALTH', 'battery_health'],
  ['REQUIREMENT_ABSOLUTE_STATUS', 'absolute_status'],
  ['REQUIREMENT_PHYSICAL_CAMERA_STATUS', 'physical_camera_status'],
  ['REQUIREMENT_TOUCHSCREEN_STATUS', 'touchscreen_status'],
  ['REQUIREMENT_KEYBOARD_LANGUAGE', 'keyboard_language'],
  ['REQUIREMENT_COMPLETE_DIAGNOSTICS', 'complete_diagnostics'],
  ['REQUIREMENT_VIRUS_CHECK', 'virus_check'],
  ['REQUIREMENT_DRIVER_CHECK', 'driver_check'],
  ['REQUIREMENT_SKINNED_STATUS', 'skinned_status'],
  ['REQUIREMENT_OVERALL_GRADE', 'overall_grade'],
  ['REQUIREMENT_UNIT_OUTCOME', 'unit_outcome']
].map(([idName, legacyCode]) => ({
  systemId: SYSTEM_CONFIG_VALUE_IDS[idName],
  categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_TYPES,
  name: `Lot requirement: ${legacyCode}`,
  legacyCodes: [legacyCode],
  required: false
}));

const REQUIREMENT_KEY_BY_SYSTEM_VALUE_ID = Object.freeze(Object.fromEntries(
  requirementValues.map((entry) => [entry.systemId, String(entry.name).replace(/^Lot requirement: /, '')])
));

const VALUE_BINDINGS = Object.freeze([
  { systemId: SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_ACTIVE, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.ACCOUNT_STATUSES, name: 'Active account', legacyCodes: ['active'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_PENDING_SETUP, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.ACCOUNT_STATUSES, name: 'Pending setup account', legacyCodes: ['pending_setup'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_SETUP, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PASSWORD_LINK_TYPES, name: 'Password setup link', legacyCodes: ['password_setup', 'setup'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_RESET, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PASSWORD_LINK_TYPES, name: 'Password reset link', legacyCodes: ['password_reset', 'reset'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_EXPIRY_HOURS, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.SECURITY_SETTINGS, name: 'Password link expiry hours', legacyCodes: ['password_link_expiry_hours'], required: true },

  { systemId: SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_ASSET_TAG, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_IDENTIFIER_TYPES, name: 'Asset Tag identifier', legacyCodes: ['asset_tag'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_UNIT_SERIAL, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_IDENTIFIER_TYPES, name: 'Unit Serial identifier', legacyCodes: ['unit_serial_number', 'unit_serial'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_BIOS_SERIAL, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_IDENTIFIER_TYPES, name: 'BIOS Serial identifier', legacyCodes: ['bios_serial_number', 'bios_serial'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_STATUS_RECEIVED, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_STATUSES, name: 'Received Unit status', legacyCodes: ['received'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.LOT_STATUS_DEFAULT, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.LOT_STATUSES, name: 'Default Lot status', legacyCodes: ['active', 'open', 'created', 'new', 'pending'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.COMMENT_GENERAL, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COMMENT_TYPES, name: 'General Unit comment', legacyCodes: ['general'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_ISSUE_NONE, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_ISSUE_TYPES, name: 'No cosmetic issue', legacyCodes: ['none', 'no_issue', 'no_issues', 'no_cosmetic_issue', 'no_cosmetic_issues'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.HARDWARE_ISSUE_NONE, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.HARDWARE_ISSUE_TYPES, name: 'No hardware issue', legacyCodes: ['none', 'no_issue', 'no_issues', 'hardware_none', 'hardware_issue_none', 'no_hardware_issue', 'no_hardware_issues'], required: false },

  { systemId: SYSTEM_CONFIG_VALUE_IDS.OVERRIDE_APPROVED, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.OVERRIDE_STATUSES, name: 'Approved override', legacyCodes: ['approved'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.OVERRIDE_CANCELLED, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.OVERRIDE_STATUSES, name: 'Cancelled override', legacyCodes: ['cancelled'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.OVERRIDE_EXPIRED, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.OVERRIDE_STATUSES, name: 'Expired override', legacyCodes: ['expired'], required: true },

  ...requirementValues,

  { systemId: SYSTEM_CONFIG_VALUE_IDS.OPERATOR_EQUALS, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COMPARISON_OPERATORS, name: 'Equals operator', legacyCodes: ['equals'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.OPERATOR_GREATER_EQUAL, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COMPARISON_OPERATORS, name: 'Minimum operator', legacyCodes: ['greater_equal', 'minimum'], required: true },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.OPERATOR_LESS_EQUAL, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COMPARISON_OPERATORS, name: 'Maximum operator', legacyCodes: ['less_equal', 'maximum'], required: true },

  { systemId: SYSTEM_CONFIG_VALUE_IDS.POLICY_STRICT, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES, name: 'Strict requirement policy', legacyCodes: ['strict', 'required', 'enforced'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.POLICY_WARN_ONLY, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES, name: 'Warn-only requirement policy', legacyCodes: ['warn_only', 'warn', 'warning'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.POLICY_OPEN_MIXED, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES, name: 'Open/mixed requirement policy', legacyCodes: ['open_mixed', 'open', 'mixed', 'flexible'], required: false },

  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_LAPTOP, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, name: 'Laptop category', legacyCodes: ['laptop', 'laptops', 'notebook', 'notebooks'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_DESKTOP, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, name: 'Desktop category', legacyCodes: ['desktop', 'desktops', 'pc', 'pcs'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_MACBOOK, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, name: 'MacBook category', legacyCodes: ['macbook', 'macbooks', 'mac', 'macs', 'apple'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_WINDOWS_SURFACE, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, name: 'Windows Surface category', legacyCodes: ['windows_surface', 'surface', 'surface_windows'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_ELS, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, name: 'ELS category', legacyCodes: ['els'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_CONFIGURATION_TASK, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, name: 'Configuration Task category', legacyCodes: ['configuration_task', 'config_task'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_CHROME, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES, name: 'Chrome category', legacyCodes: ['chrome', 'chromebook', 'chromebooks'], required: false },

  { systemId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_LAPTOP, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES, name: 'Laptop production weight', legacyCodes: ['production_weight_laptop', 'laptop'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_DESKTOP, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES, name: 'Desktop production weight', legacyCodes: ['production_weight_desktop', 'desktop'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_MAC, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES, name: 'Mac production weight', legacyCodes: ['production_weight_mac', 'mac'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_WINDOWS_SURFACE, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES, name: 'Windows Surface production weight', legacyCodes: ['production_weight_windows_surface', 'windows_surface'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_ELS, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES, name: 'ELS production weight', legacyCodes: ['production_weight_els', 'els'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_CONFIGURATION_TASK, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES, name: 'Configuration Task production weight', legacyCodes: ['production_weight_configuration_task', 'configuration_task'], required: false },

  { systemId: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_A, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES, name: 'Cosmetic Grade A', legacyCodes: ['a', 'grade_a', 'cosmetic_grade_a'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_AB, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES, name: 'Cosmetic Grade AB', legacyCodes: ['ab', 'grade_ab', 'cosmetic_grade_ab'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_B, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES, name: 'Cosmetic Grade B', legacyCodes: ['b', 'grade_b', 'cosmetic_grade_b'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_C, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES, name: 'Cosmetic Grade C', legacyCodes: ['c', 'grade_c', 'cosmetic_grade_c'], required: false },
  { systemId: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_D, categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES, name: 'Cosmetic Grade D', legacyCodes: ['d', 'grade_d', 'cosmetic_grade_d'], required: false }
].map((entry) => Object.freeze({ ...entry, legacyCodes: Object.freeze(entry.legacyCodes) })));


const SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY = Object.freeze(Object.fromEntries(
  Object.entries(REQUIREMENT_KEY_BY_SYSTEM_VALUE_ID).map(([systemId, key]) => [key, Number(systemId)])
));

const OPERATOR_KEY_BY_SYSTEM_VALUE_ID = Object.freeze({
  [SYSTEM_CONFIG_VALUE_IDS.OPERATOR_EQUALS]: 'equals',
  [SYSTEM_CONFIG_VALUE_IDS.OPERATOR_GREATER_EQUAL]: 'greater_equal',
  [SYSTEM_CONFIG_VALUE_IDS.OPERATOR_LESS_EQUAL]: 'less_equal'
});

const SYSTEM_VALUE_ID_BY_OPERATOR_KEY = Object.freeze({
  equals: SYSTEM_CONFIG_VALUE_IDS.OPERATOR_EQUALS,
  greater_equal: SYSTEM_CONFIG_VALUE_IDS.OPERATOR_GREATER_EQUAL,
  less_equal: SYSTEM_CONFIG_VALUE_IDS.OPERATOR_LESS_EQUAL
});

const POLICY_KEY_BY_SYSTEM_VALUE_ID = Object.freeze({
  [SYSTEM_CONFIG_VALUE_IDS.POLICY_STRICT]: 'strict',
  [SYSTEM_CONFIG_VALUE_IDS.POLICY_WARN_ONLY]: 'warn_only',
  [SYSTEM_CONFIG_VALUE_IDS.POLICY_OPEN_MIXED]: 'open_mixed'
});

const COSMETIC_GRADE_BY_SYSTEM_VALUE_ID = Object.freeze({
  [SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_A]: 'A',
  [SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_AB]: 'AB',
  [SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_B]: 'B',
  [SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_C]: 'C',
  [SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_D]: 'D'
});

const IDENTIFIER_KEY_BY_SYSTEM_VALUE_ID = Object.freeze({
  [SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_ASSET_TAG]: 'asset_tag',
  [SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_UNIT_SERIAL]: 'unit_serial_number',
  [SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_BIOS_SERIAL]: 'bios_serial_number'
});

const CATEGORY_BY_SYSTEM_ID = new Map(CATEGORY_BINDINGS.map((entry) => [entry.systemId, entry]));
const VALUE_BY_SYSTEM_ID = new Map(VALUE_BINDINGS.map((entry) => [entry.systemId, entry]));

function getCategoryBinding(systemId) {
  return CATEGORY_BY_SYSTEM_ID.get(Number(systemId)) || null;
}

function getValueBinding(systemId) {
  return VALUE_BY_SYSTEM_ID.get(Number(systemId)) || null;
}

module.exports = {
  CATEGORY_BINDINGS,
  COSMETIC_GRADE_BY_SYSTEM_VALUE_ID,
  IDENTIFIER_KEY_BY_SYSTEM_VALUE_ID,
  OPERATOR_KEY_BY_SYSTEM_VALUE_ID,
  POLICY_KEY_BY_SYSTEM_VALUE_ID,
  REQUIREMENT_KEY_BY_SYSTEM_VALUE_ID,
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS,
  SYSTEM_VALUE_ID_BY_OPERATOR_KEY,
  SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY,
  VALUE_BINDINGS,
  getCategoryBinding,
  getValueBinding
};
