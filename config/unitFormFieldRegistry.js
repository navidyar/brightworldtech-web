'use strict';

/**
 * Authoritative inventory for the /tech/units Add/Edit form.
 *
 * Stage 1B deliberately does not import this module from the live controller,
 * EJS form, browser JavaScript, or Lots routes. It establishes stable field
 * keys and validation rules for later lot-profile stages without changing
 * current application behavior.
 */

const VISIBILITY = Object.freeze({
  INHERIT: 'inherit',
  VISIBLE: 'visible',
  HIDDEN: 'hidden'
});

const REQUIREMENT = Object.freeze({
  INHERIT: 'inherit',
  REQUIRED: 'required',
  OPTIONAL: 'optional'
});

const PRESERVATION = Object.freeze({
  PRESERVE_WHEN_HIDDEN: 'preserve_when_hidden',
  APPEND_ONLY: 'append_only',
  REPLACE_CURRENT_SET_WHEN_MANAGED: 'replace_current_set_when_managed',
  SYSTEM_MANAGED: 'system_managed',
  CLEAR_WHEN_HIDDEN: 'clear_when_hidden',
  NOT_APPLICABLE: 'not_applicable'
});

const RULE_TYPE = Object.freeze({
  FIELD: 'field',
  REPEATABLE_SECTION: 'repeatable_section',
  REPEATABLE_CHILD: 'repeatable_child',
  COMPANION_FIELD: 'companion_field',
  COMPOUND_WORKFLOW: 'compound_workflow',
  WORKFLOW_CONTROL: 'workflow_control',
  PERMISSION_CONTROL: 'permission_control',
  DERIVED_CONTROL: 'derived_control',
  SYSTEM_CONTROL: 'system_control',
  FUTURE_SECTION: 'future_section',
  LEGACY_HIDDEN: 'legacy_hidden'
});

const AVAILABILITY = Object.freeze({
  CREATE_EDIT: 'create_edit',
  CREATE_ONLY: 'create_only',
  EDIT_ONLY: 'edit_only',
  EDIT_LEAD_PLUS: 'edit_lead_plus',
  NOT_RENDERED: 'not_rendered'
});

const UNIT_FORM_SECTIONS = Object.freeze([
  Object.freeze({ key: 'assignment', label: 'Assignment', order: 10 }),
  Object.freeze({ key: 'identity', label: 'Identity', order: 20 }),
  Object.freeze({ key: 'amazon', label: 'Amazon', order: 25 }),
  Object.freeze({ key: 'model', label: 'Model', order: 30 }),
  Object.freeze({ key: 'production_weight', label: 'Production Weight', order: 40 }),
  Object.freeze({ key: 'processor', label: 'Processor', order: 50 }),
  Object.freeze({ key: 'memory', label: 'Memory', order: 60 }),
  Object.freeze({ key: 'storage', label: 'Storage', order: 70 }),
  Object.freeze({ key: 'specifications', label: 'Specifications', order: 80 }),
  Object.freeze({ key: 'tests', label: 'Tests & Checks', order: 85 }),
  Object.freeze({ key: 'issues', label: 'Issues', order: 90 }),
  Object.freeze({ key: 'grade_outcome', label: 'Grade & Outcome', order: 100 }),
  Object.freeze({ key: 'comments', label: 'Comments', order: 110 }),
  Object.freeze({ key: 'legacy_hidden', label: 'Legacy Hidden', order: 120 })
]);

function defineField(definition) {
  return Object.freeze({
    parentKey: null,
    requiredSemantics: null,
    protected: false,
    protectedReason: '',
    enabledForLotRules: true,
    applicableManufacturers: null,
    excludedManufacturers: null,
    ...definition
  });
}

function configurableField(key, label, section, submissionName, storagePath, extra = {}) {
  return defineField({
    key,
    label,
    section,
    submissionName,
    storagePath,
    ruleType: RULE_TYPE.FIELD,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN,
    ...extra
  });
}

function protectedControl(definition) {
  return defineField({
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: false,
    requirementConfigurable: false,
    enabledForLotRules: false,
    protected: true,
    preservationPolicy: PRESERVATION.SYSTEM_MANAGED,
    ...definition
  });
}

function repeatableChild(key, label, section, parentKey, submissionName, storagePath, extra = {}) {
  return defineField({
    key,
    label,
    section,
    parentKey,
    submissionName,
    storagePath,
    ruleType: RULE_TYPE.REPEATABLE_CHILD,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: false,
    requirementConfigurable: false,
    enabledForLotRules: false,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    ...extra
  });
}

function configurableRepeatableChild(key, label, section, parentKey, submissionName, storagePath, extra = {}) {
  return repeatableChild(key, label, section, parentKey, submissionName, storagePath, {
    visibilityConfigurable: true,
    requirementConfigurable: true,
    enabledForLotRules: true,
    ...extra
  });
}

const UNIT_FORM_FIELD_REGISTRY = Object.freeze([
  protectedControl({
    key: 'assignable_lot',
    label: 'Assignable Lot',
    section: 'assignment',
    submissionName: 'lotId',
    storagePath: 'units.lot_id',
    ruleType: RULE_TYPE.FIELD,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultRequired: true,
    protectedReason: 'The selected lot determines the destination and future effective form profile.'
  }),
  protectedControl({
    key: 'current_unit_status',
    label: 'Current Unit Status',
    section: 'assignment',
    submissionName: 'currentUnitStatusConfigValueId',
    storagePath: 'units.current_unit_status_config_value_id',
    ruleType: RULE_TYPE.SYSTEM_CONTROL,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: false,
    defaultRequired: true,
    protectedReason: 'The required hidden status value is controlled by the unit lifecycle.'
  }),
  protectedControl({
    key: 'duplicate_assumption_nonce',
    label: 'Duplicate Assumption Nonce',
    section: 'assignment',
    submissionName: 'duplicateAssumptionNonce',
    storagePath: 'session/workflow only',
    ruleType: RULE_TYPE.WORKFLOW_CONTROL,
    availability: AVAILABILITY.CREATE_ONLY,
    defaultVisible: false,
    protectedReason: 'Session-integrity control for the duplicate-assumption workflow.',
    preservationPolicy: PRESERVATION.NOT_APPLICABLE
  }),
  protectedControl({
    key: 'asset_tag',
    label: 'Asset Tag',
    section: 'identity',
    submissionName: null,
    storagePath: 'units.asset_number',
    ruleType: RULE_TYPE.DERIVED_CONTROL,
    availability: AVAILABILITY.EDIT_ONLY,
    protectedReason: 'Generated permanent identity shown read-only on Edit.',
    preservationPolicy: PRESERVATION.NOT_APPLICABLE
  }),
  configurableField('unit_serial_number', 'Unit Serial Number', 'identity', 'unitSerialNumber', 'unit_identifiers.identifier_value'),
  configurableField('bios_serial_number', 'BIOS Serial Number', 'identity', 'biosSerialNumber', 'unit_identifiers.identifier_value'),

  defineField({
    key: 'amazon_asset_tag',
    label: 'Amazon Asset Tag',
    section: 'amazon',
    submissionName: null,
    storagePath: 'unit_identifiers.identifier_value',
    ruleType: RULE_TYPE.DERIVED_CONTROL,
    availability: AVAILABILITY.EDIT_ONLY,
    defaultVisible: false,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: false,
    enabledForLotRules: true,
    preservationPolicy: PRESERVATION.SYSTEM_MANAGED,
    requiredSemantics: 'Generated automatically from the global AZ sequence when the Lot enables Amazon Asset Tag generation.'
  }),
  configurableField('fnsku', 'FNSKU', 'amazon', 'fnsku', 'unit_amazon_details.fnsku', { defaultVisible: false }),
  configurableField('asin', 'ASIN', 'amazon', 'asin', 'unit_amazon_details.asin', { defaultVisible: false }),
  configurableField('tracking_number', 'Tracking Number', 'amazon', 'trackingNumber', 'unit_amazon_details.tracking_number', { defaultVisible: false }),
  configurableField('pallet_number', 'Pallet Number', 'amazon', 'palletNumber', 'unit_amazon_details.pallet_number', {
    defaultVisible: false,
    preservationPolicy: PRESERVATION.CLEAR_WHEN_HIDDEN
  }),
  configurableField('buyer_comments', 'Buyer Comments', 'amazon', 'buyerComments', 'unit_amazon_details.buyer_comments', { defaultVisible: false }),

  configurableField('manufacturer', 'Manufacturer', 'model', 'manufacturerId', 'units.manufacturer_id'),
  configurableField('unit_model', 'Unit Model', 'model', 'unitModelId', 'units.unit_model_id'),
  configurableField('screen_size', 'Screen Size', 'model', 'screenSizeConfigValueId', 'units.screen_size_config_value_id'),
  configurableField('apple_model_number', 'Apple Model Number', 'model', 'appleModelNumber', 'unit_specifications.apple_model_number', {
    applicableManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('model_year', 'Model Year', 'model', 'modelYear', 'units.model_year', {
    requiredSemantics: 'A four-digit model year from 1980 through 2100 is required.',
    applicableManufacturers: Object.freeze(['Apple'])
  }),
  protectedControl({
    key: 'unit_category',
    label: 'Unit Category',
    section: 'model',
    submissionName: 'unitCategoryConfigValueId',
    storagePath: 'units.unit_category_config_value_id',
    ruleType: RULE_TYPE.FIELD,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultRequired: true,
    protectedReason: 'The current database and controller require a category; production weighting may depend on it.',
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),
  protectedControl({
    key: 'missing_model_request',
    label: 'Request Missing Model',
    section: 'model',
    submissionName: null,
    storagePath: 'unit_model_catalog_requests via separate workflow',
    ruleType: RULE_TYPE.WORKFLOW_CONTROL,
    availability: AVAILABILITY.CREATE_ONLY,
    protectedReason: 'Visibility is governed by role, mode, and catalog context.',
    preservationPolicy: PRESERVATION.NOT_APPLICABLE
  }),

  protectedControl({
    key: 'effective_weight_preview',
    label: 'Effective Weight',
    section: 'production_weight',
    submissionName: null,
    storagePath: 'derived from unit override, lot, and category',
    ruleType: RULE_TYPE.DERIVED_CONTROL,
    availability: AVAILABILITY.EDIT_ONLY,
    protectedReason: 'Read-only operational context controlled by permissions and form mode.',
    preservationPolicy: PRESERVATION.NOT_APPLICABLE
  }),
  protectedControl({
    key: 'production_weight_override',
    label: 'Unit Override Weight',
    section: 'production_weight',
    submissionName: 'productionWeightOverride',
    storagePath: 'units.production_weight_override',
    ruleType: RULE_TYPE.PERMISSION_CONTROL,
    availability: AVAILABILITY.EDIT_LEAD_PLUS,
    protectedReason: 'Existing role permissions remain authoritative.',
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),
  protectedControl({
    key: 'production_weight_notes',
    label: 'Unit Override Notes',
    section: 'production_weight',
    submissionName: 'productionWeightNotes',
    storagePath: 'units.production_weight_notes',
    ruleType: RULE_TYPE.PERMISSION_CONTROL,
    availability: AVAILABILITY.EDIT_LEAD_PLUS,
    protectedReason: 'Existing role permissions remain authoritative.',
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),

  protectedControl({
    key: 'processor_type_filter',
    label: 'Processor Type',
    section: 'processor',
    parentKey: 'processor_model',
    submissionName: null,
    storagePath: 'not stored',
    ruleType: RULE_TYPE.DERIVED_CONTROL,
    availability: AVAILABILITY.CREATE_EDIT,
    protectedReason: 'UI filter follows Processor visibility and is not independently configurable.',
    preservationPolicy: PRESERVATION.NOT_APPLICABLE
  }),
  configurableField('processor_model', 'Processor', 'processor', 'processorModelId', 'units.processor_model_id'),
  configurableField('processor_speed_ghz', 'Processor Speed GHz', 'processor', 'processorSpeedGhz', 'units.processor_speed_ghz'),
  protectedControl({
    key: 'missing_processor_request',
    label: 'Request Processor Addition',
    section: 'processor',
    parentKey: 'processor_model',
    submissionName: null,
    storagePath: 'unit_processor_catalog_requests via separate workflow',
    ruleType: RULE_TYPE.WORKFLOW_CONTROL,
    availability: AVAILABILITY.CREATE_ONLY,
    protectedReason: 'Visibility is governed by role, mode, model context, and catalog state.',
    preservationPolicy: PRESERVATION.NOT_APPLICABLE
  }),

  defineField({
    key: 'memory_modules',
    label: 'Current Memory Modules',
    section: 'memory',
    submissionName: 'memoryModules[index][...]',
    storagePath: 'unit_memory_modules and units.ram_gb summary',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one complete meaningful memory row is required.'
  }),
  repeatableChild('memory_module_slot', 'Memory: Slot Label', 'memory', 'memory_modules', 'memoryModules[index][slotLabel]', 'unit_memory_modules.slot_label'),
  repeatableChild('memory_module_size', 'Memory: Size GB', 'memory', 'memory_modules', 'memoryModules[index][sizeGb]', 'unit_memory_modules.size_gb'),
  repeatableChild('memory_module_type', 'Memory: Memory Type', 'memory', 'memory_modules', 'memoryModules[index][ramTypeConfigValueId]', 'unit_memory_modules.ram_type_config_value_id'),
  repeatableChild('memory_install_type', 'Memory: Install Type', 'memory', 'memory_modules', 'memoryModules[index][memoryInstallTypeCode]', 'unit_memory_modules.memory_install_type_code'),
  configurableField('previous_memory_size', 'Previous Memory Size', 'memory', 'previousRamGb', 'units.previous_ram_gb', {
    requirementConfigurable: true,
    inheritVisibilityFromFieldKey: 'memory_modules',
    requiredSemantics: null
  }),

  defineField({
    key: 'storage_devices',
    label: 'Current Storage Devices',
    section: 'storage',
    submissionName: 'storageDevices[index][...]',
    storagePath: 'unit_storage_devices and units.storage_gb summary',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one complete meaningful storage row is required.'
  }),
  repeatableChild('storage_device_slot', 'Storage: Slot Label', 'storage', 'storage_devices', 'storageDevices[index][slotLabel]', 'unit_storage_devices.slot_label'),
  repeatableChild('storage_device_size', 'Storage: Size GB', 'storage', 'storage_devices', 'storageDevices[index][sizeGb]', 'unit_storage_devices.size_gb'),
  repeatableChild('storage_device_type', 'Storage: Storage Type', 'storage', 'storage_devices', 'storageDevices[index][storageTypeConfigValueId]', 'unit_storage_devices.storage_type_config_value_id'),
  repeatableChild('storage_wipe_status', 'Storage: Wipe Status', 'storage', 'storage_devices', 'storageDevices[index][wipeStatusConfigValueId]', 'unit_storage_devices.wipe_status_config_value_id'),
  configurableField('previous_storage_size', 'Previous Storage Size', 'storage', 'previousStorageGb', 'units.previous_storage_gb', {
    requirementConfigurable: true,
    inheritVisibilityFromFieldKey: 'storage_devices',
    requiredSemantics: null
  }),

  configurableField('operating_system', 'Operating System', 'specifications', 'operatingSystemConfigValueId', 'units.operating_system_config_value_id'),
  configurableField('os_build', 'OS Build', 'specifications', 'osBuild', 'unit_specifications.os_build'),
  configurableField('bios_version', 'BIOS / Firmware Version', 'specifications', 'biosVersion', 'unit_specifications.bios_version'),
  configurableField('keyboard_language', 'Keyboard Language', 'specifications', 'keyboardLanguageConfigValueId', 'unit_specifications.keyboard_language_config_value_id'),
  configurableField('wifi_card_present', 'Wi-Fi Card Present', 'specifications', 'wifiCardPresentConfigValueId', 'unit_specifications.wifi_card_present_config_value_id', {
    excludedManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('charger_included', 'Charger Included', 'specifications', 'chargerIncludedConfigValueId', 'unit_specifications.charger_included_config_value_id'),
  configurableField('display_type', 'Display Type', 'specifications', 'displayTypeConfigValueId', 'unit_specifications.display_type_config_value_id'),
  configurableField('native_screen_resolution', 'Native Screen Resolution', 'specifications', 'nativeScreenResolutionConfigValueId', 'unit_specifications.native_screen_resolution_config_value_id', {
    excludedManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('refresh_rate', 'Refresh Rate', 'specifications', 'refreshRateConfigValueId', 'unit_specifications.refresh_rate_config_value_id', {
    excludedManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('color', 'Color', 'specifications', 'colorConfigValueId', 'unit_specifications.color_config_value_id'),

  defineField({
    key: 'cameras',
    label: 'Cameras',
    section: 'specifications',
    submissionName: 'cameras[index][...]',
    storagePath: 'unit_cameras',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    enabledForLotRules: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one camera row is required.'
  }),
  configurableRepeatableChild('camera_type', 'Camera Type', 'specifications', 'cameras', 'cameras[index][cameraTypeConfigValueId]', 'unit_cameras.camera_type_config_value_id'),
  configurableRepeatableChild('camera_location', 'Camera Location', 'specifications', 'cameras', 'cameras[index][cameraLocationConfigValueId]', 'unit_cameras.camera_location_config_value_id'),
  configurableRepeatableChild('camera_test', 'Camera Test', 'specifications', 'cameras', 'cameras[index][testResultConfigValueId]', 'unit_cameras.test_result_config_value_id'),

  defineField({
    key: 'batteries',
    label: 'Batteries',
    section: 'specifications',
    submissionName: 'batteries[index][...]',
    storagePath: 'unit_batteries and units.battery_health_percent summary',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    enabledForLotRules: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one battery row is required.'
  }),
  configurableRepeatableChild('battery_health', 'Battery Health', 'specifications', 'batteries', 'batteries[index][healthPercent]', 'unit_batteries.health_percent', {
    requiredSemantics: 'Battery Health is required for every recorded battery.'
  }),
  configurableRepeatableChild('battery_cycle_count', 'Battery Cycle Count', 'specifications', 'batteries', 'batteries[index][cycleCount]', 'unit_batteries.cycle_count', {
    requiredSemantics: 'Battery Cycle Count is required for every recorded battery.',
    applicableManufacturers: Object.freeze(['Apple'])
  }),

  defineField({
    key: 'biometrics',
    label: 'Biometrics',
    section: 'specifications',
    submissionName: 'biometrics[index][...]',
    storagePath: 'unit_biometrics',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    enabledForLotRules: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one biometric hardware row is required.'
  }),
  configurableRepeatableChild('biometric_hardware', 'Biometric Hardware', 'specifications', 'biometrics', 'biometrics[index][hardwareConfigValueId]', 'unit_biometrics.hardware_config_value_id'),
  configurableRepeatableChild('biometrics_test', 'Biometrics Test', 'specifications', 'biometrics', 'biometrics[index][testResultConfigValueId]', 'unit_biometrics.test_result_config_value_id'),

  defineField({
    key: 'ports',
    label: 'Ports / Expansion',
    section: 'specifications',
    submissionName: 'ports[index][...]',
    storagePath: 'unit_ports',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    enabledForLotRules: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one Port / Expansion row is required.'
  }),
  configurableRepeatableChild('port_type', 'Port / Expansion Type', 'specifications', 'ports', 'ports[index][portTypeConfigValueId]', 'unit_ports.port_type_config_value_id'),
  configurableRepeatableChild('port_count', 'Port / Expansion Count', 'specifications', 'ports', 'ports[index][portCount]', 'unit_ports.port_count'),

  configurableField('keyboard_test', 'Keyboard Test', 'tests', 'keyboardTestResultConfigValueId', 'unit_specifications.keyboard_test_result_config_value_id'),
  configurableField('touchscreen_status', 'Touchscreen Test', 'tests', 'touchscreenStatusConfigValueId', 'unit_specifications.touchscreen_status_config_value_id'),
  configurableField('microphone_check', 'Microphone Check', 'tests', 'microphoneCheckResultConfigValueId', 'unit_specifications.microphone_check_result_config_value_id'),
  configurableField('audio_output_check', 'Audio Output Check', 'tests', 'audioOutputCheckResultConfigValueId', 'unit_specifications.audio_output_check_result_config_value_id'),
  configurableField('all_screws_present', 'All Screws Present', 'tests', 'allScrewsPresentConfigValueId', 'unit_specifications.all_screws_present_config_value_id'),
  configurableField('complete_diagnostics', 'Diagnostics Test', 'tests', 'completeDiagnosticsStatusConfigValueId', 'unit_specifications.complete_diagnostics_status_config_value_id'),
  configurableField('virus_check', 'Threat Protection Scan', 'tests', 'virusCheckStatusConfigValueId', 'unit_specifications.virus_check_status_config_value_id'),
  configurableField('driver_check', 'Driver Check', 'tests', 'driverCheckStatusConfigValueId', 'unit_specifications.driver_check_status_config_value_id', {
    excludedManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('absolute_status', 'Absolute Status', 'tests', 'absoluteStatusConfigValueId', 'unit_specifications.absolute_status_config_value_id', {
    excludedManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('bios_lock', 'BIOS Lock', 'tests', 'biosLockConfigValueId', 'unit_specifications.bios_lock_config_value_id', {
    excludedManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('efi_lock', 'EFI Lock', 'tests', 'efiLockConfigValueId', 'unit_specifications.efi_lock_config_value_id', {
    applicableManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('mdm_lock', 'MDM Lock', 'tests', 'mdmLockConfigValueId', 'unit_specifications.mdm_lock_config_value_id'),
  configurableField('icloud_activation_lock', 'iCloud Activation Lock', 'tests', 'icloudActivationLockConfigValueId', 'unit_specifications.icloud_activation_lock_config_value_id', {
    applicableManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('ce_certification', 'CE Certification', 'tests', 'ceCertificationConfigValueId', 'unit_specifications.ce_certification_config_value_id', {
    applicableManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('open_box_status', 'Open-Box Status', 'tests', 'openBoxStatusConfigValueId', 'unit_specifications.open_box_status_config_value_id', {
    applicableManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('box_language', 'Box Language', 'tests', 'boxLanguageConfigValueId', 'unit_specifications.box_language_config_value_id', {
    applicableManufacturers: Object.freeze(['Apple'])
  }),
  configurableField('skinned_status', 'Skinned', 'tests', 'skinnedStatusConfigValueId', 'unit_specifications.skinned_status_config_value_id'),
  protectedControl({
    key: 'physical_camera_status',
    label: 'Legacy Physical Camera Status',
    section: 'legacy_hidden',
    submissionName: 'physicalCameraStatusConfigValueId',
    storagePath: 'unit_specifications.physical_camera_status_config_value_id',
    ruleType: RULE_TYPE.LEGACY_HIDDEN,
    availability: AVAILABILITY.NOT_RENDERED,
    defaultVisible: false,
    protectedReason: 'Superseded by structured Camera rows.',
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),
  protectedControl({
    key: 'graphics_adapters',
    label: 'Graphics Adapters',
    section: 'specifications',
    submissionName: 'graphicsAdapters[index][...]',
    storagePath: 'unit_graphics_adapters',
    ruleType: RULE_TYPE.FUTURE_SECTION,
    availability: AVAILABILITY.NOT_RENDERED,
    defaultVisible: false,
    protectedReason: 'Model support exists, but the current EJS does not render this section.',
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED
  }),

  defineField({
    key: 'cosmetic_issues',
    label: 'Cosmetic Issue Rows',
    section: 'issues',
    submissionName: 'cosmeticIssues[index][...]',
    storagePath: 'unit_issue_entries where issue_area=cosmetic',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one complete meaningful cosmetic issue row is required.'
  }),
  defineField({
    key: 'hardware_issues',
    label: 'Hardware Issue Rows',
    section: 'issues',
    submissionName: 'hardwareIssues[index][...]',
    storagePath: 'unit_issue_entries where issue_area=hardware',
    ruleType: RULE_TYPE.REPEATABLE_SECTION,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    preservationPolicy: PRESERVATION.REPLACE_CURRENT_SET_WHEN_MANAGED,
    requiredSemantics: 'At least one complete meaningful hardware issue row is required.'
  }),

  configurableField('overall_grade', 'Cosmetic Grade', 'grade_outcome', 'overallGradeConfigValueId', 'unit_grade_assessments'),
  configurableField('unit_outcome', 'Unit Outcome', 'grade_outcome', 'outcomeCode', 'unit_outcomes'),
  defineField({
    key: 'overall_grade_notes',
    label: 'Cosmetic Grade Notes',
    section: 'grade_outcome',
    parentKey: 'overall_grade',
    submissionName: 'overallGradeNotes',
    storagePath: 'unit_grade_assessments.notes',
    ruleType: RULE_TYPE.COMPANION_FIELD,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),
  defineField({
    key: 'outcome_notes',
    label: 'Outcome Notes',
    section: 'grade_outcome',
    parentKey: 'unit_outcome',
    submissionName: 'outcomeNotes',
    storagePath: 'unit_outcomes.outcome_notes',
    ruleType: RULE_TYPE.COMPANION_FIELD,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: true,
    defaultRequired: false,
    visibilityConfigurable: true,
    requirementConfigurable: true,
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),
  protectedControl({
    key: 'outcome_approval',
    label: 'Outcome Approval Request',
    section: 'grade_outcome',
    parentKey: 'unit_outcome',
    submissionName: 'outcomeApprovalRequested + outcomeApprovalRequestNotes',
    storagePath: 'unit_outcomes and approval/request workflow',
    ruleType: RULE_TYPE.COMPOUND_WORKFLOW,
    availability: AVAILABILITY.CREATE_EDIT,
    protectedReason: 'Follows Unit Outcome and existing approval permissions; it cannot be required independently.',
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),

  configurableField('general_comment', 'General Comment', 'comments', 'generalCommentText', 'unit_comments', {
    ruleType: RULE_TYPE.FIELD,
    preservationPolicy: PRESERVATION.APPEND_ONLY,
    warning: 'Requiring an append-only comment on every Edit may create repetitive history entries.'
  }),
  protectedControl({
    key: 'general_comment_type',
    label: 'General Comment Type',
    section: 'comments',
    parentKey: 'general_comment',
    submissionName: 'generalCommentTypeConfigValueId',
    storagePath: 'unit_comments.note_type_config_value_id',
    ruleType: RULE_TYPE.SYSTEM_CONTROL,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: false,
    protectedReason: 'Hidden companion value used only when a General Comment is appended.'
  }),

  protectedControl({
    key: 'hardware_notes',
    label: 'Hardware Notes',
    section: 'legacy_hidden',
    submissionName: 'hardwareNotes',
    storagePath: 'units.hardware_notes',
    ruleType: RULE_TYPE.LEGACY_HIDDEN,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: false,
    protectedReason: 'Legacy hidden field superseded by structured hardware issue rows.',
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  }),
  protectedControl({
    key: 'cosmetic_notes',
    label: 'Cosmetic Notes',
    section: 'legacy_hidden',
    submissionName: 'cosmeticNotes',
    storagePath: 'units.cosmetic_notes',
    ruleType: RULE_TYPE.LEGACY_HIDDEN,
    availability: AVAILABILITY.CREATE_EDIT,
    defaultVisible: false,
    protectedReason: 'Legacy hidden field superseded by structured cosmetic issue rows.',
    preservationPolicy: PRESERVATION.PRESERVE_WHEN_HIDDEN
  })
]);

const FIELD_DEPENDENCY_RULES = Object.freeze([
  Object.freeze({ whenVisible: 'unit_model', forceVisible: ['manufacturer', 'unit_category'] }),
  Object.freeze({ whenRequired: 'unit_model', forceRequired: ['manufacturer'] }),
  Object.freeze({ whenVisible: 'processor_model', forceVisible: ['unit_model'] }),
  Object.freeze({ whenRequired: 'processor_model', forceRequired: ['unit_model'] }),
  Object.freeze({ whenVisible: 'processor_speed_ghz', forceVisible: ['processor_model'] }),
  Object.freeze({ whenVisible: 'os_build', forceVisible: ['operating_system'] }),
  Object.freeze({ whenVisible: 'camera_type', forceVisible: ['cameras'] }),
  Object.freeze({ whenVisible: 'camera_location', forceVisible: ['cameras'] }),
  Object.freeze({ whenVisible: 'camera_test', forceVisible: ['cameras'] }),
  Object.freeze({ whenRequired: 'camera_type', forceRequired: ['cameras'] }),
  Object.freeze({ whenRequired: 'camera_location', forceRequired: ['cameras'] }),
  Object.freeze({ whenRequired: 'camera_test', forceRequired: ['cameras'] }),
  Object.freeze({ whenVisible: 'battery_health', forceVisible: ['batteries'] }),
  Object.freeze({ whenVisible: 'battery_cycle_count', forceVisible: ['batteries'] }),
  Object.freeze({ whenRequired: 'battery_health', forceRequired: ['batteries'] }),
  Object.freeze({ whenRequired: 'battery_cycle_count', forceRequired: ['batteries'] }),
  Object.freeze({ whenVisible: 'biometric_hardware', forceVisible: ['biometrics'] }),
  Object.freeze({ whenVisible: 'biometrics_test', forceVisible: ['biometrics'] }),
  Object.freeze({ whenRequired: 'biometric_hardware', forceRequired: ['biometrics'] }),
  Object.freeze({ whenRequired: 'biometrics_test', forceRequired: ['biometrics'] }),
  Object.freeze({ whenVisible: 'port_type', forceVisible: ['ports'] }),
  Object.freeze({ whenVisible: 'port_count', forceVisible: ['ports'] }),
  Object.freeze({ whenRequired: 'port_type', forceRequired: ['ports'] }),
  Object.freeze({ whenRequired: 'port_count', forceRequired: ['ports'] }),
  Object.freeze({ whenVisible: 'overall_grade_notes', forceVisible: ['overall_grade'] }),
  Object.freeze({ whenVisible: 'outcome_notes', forceVisible: ['unit_outcome'] }),
  Object.freeze({ whenVisible: 'outcome_approval', forceVisible: ['unit_outcome'] })
]);

const SECTION_KEYS = new Set(UNIT_FORM_SECTIONS.map((section) => section.key));
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const VALID_RULE_TYPES = new Set(Object.values(RULE_TYPE));
const VALID_AVAILABILITY = new Set(Object.values(AVAILABILITY));
const VALID_PRESERVATION = new Set(Object.values(PRESERVATION));

function assertValidUnitFormFieldRegistry(registry = UNIT_FORM_FIELD_REGISTRY, dependencyRules = FIELD_DEPENDENCY_RULES) {
  if (!Array.isArray(registry) || registry.length === 0) {
    throw new Error('Unit form field registry must be a non-empty array.');
  }

  const keys = new Set();
  const fieldsByKey = new Map();

  for (const field of registry) {
    if (!field || typeof field !== 'object') {
      throw new Error('Each unit form field definition must be an object.');
    }

    if (!FIELD_KEY_PATTERN.test(field.key || '')) {
      throw new Error(`Invalid unit form field key: ${String(field.key)}`);
    }

    if (keys.has(field.key)) {
      throw new Error(`Duplicate unit form field key: ${field.key}`);
    }

    keys.add(field.key);
    fieldsByKey.set(field.key, field);

    if (typeof field.label !== 'string' || field.label.trim() === '') {
      throw new Error(`Unit form field ${field.key} must have a label.`);
    }

    if (!SECTION_KEYS.has(field.section)) {
      throw new Error(`Unit form field ${field.key} references unknown section: ${field.section}`);
    }

    if (!VALID_RULE_TYPES.has(field.ruleType)) {
      throw new Error(`Unit form field ${field.key} has invalid rule type: ${field.ruleType}`);
    }

    if (!VALID_AVAILABILITY.has(field.availability)) {
      throw new Error(`Unit form field ${field.key} has invalid availability: ${field.availability}`);
    }

    if (!VALID_PRESERVATION.has(field.preservationPolicy)) {
      throw new Error(`Unit form field ${field.key} has invalid preservation policy: ${field.preservationPolicy}`);
    }

    for (const property of [
      'defaultVisible',
      'defaultRequired',
      'visibilityConfigurable',
      'requirementConfigurable',
      'enabledForLotRules',
      'protected'
    ]) {
      if (typeof field[property] !== 'boolean') {
        throw new Error(`Unit form field ${field.key} must define boolean ${property}.`);
      }
    }

    if (field.defaultRequired && !field.defaultVisible && field.ruleType !== RULE_TYPE.SYSTEM_CONTROL) {
      throw new Error(`Unit form field ${field.key} cannot be required while hidden by default.`);
    }

    if (field.protected && (field.visibilityConfigurable || field.requirementConfigurable || field.enabledForLotRules)) {
      throw new Error(`Protected unit form field ${field.key} cannot be lot-configurable.`);
    }

    if (field.enabledForLotRules && !field.visibilityConfigurable && !field.requirementConfigurable) {
      throw new Error(`Unit form field ${field.key} is enabled for lot rules but exposes no configurable rule.`);
    }

    if (field.ruleType === RULE_TYPE.REPEATABLE_SECTION && !field.requiredSemantics) {
      throw new Error(`Repeatable section ${field.key} must define requiredSemantics.`);
    }
  }

  for (const field of registry) {
    if (field.parentKey) {
      if (field.parentKey === field.key) {
        throw new Error(`Unit form field ${field.key} cannot reference itself as a parent.`);
      }

      if (!fieldsByKey.has(field.parentKey)) {
        throw new Error(`Unit form field ${field.key} references unknown parent: ${field.parentKey}`);
      }
    }

    const linkedVisibilityKey = String(field.inheritVisibilityFromFieldKey || '').trim();

    if (!linkedVisibilityKey) {
      continue;
    }

    if (linkedVisibilityKey === field.key) {
      throw new Error(`Unit form field ${field.key} cannot inherit visibility from itself.`);
    }

    const linkedField = fieldsByKey.get(linkedVisibilityKey);

    if (!linkedField) {
      throw new Error(`Unit form field ${field.key} inherits visibility from unknown field: ${linkedVisibilityKey}`);
    }

    if (linkedField.inheritVisibilityFromFieldKey) {
      throw new Error(`Unit form field ${field.key} cannot inherit visibility through a linked-field chain.`);
    }
  }

  if (!Array.isArray(dependencyRules)) {
    throw new Error('Unit form field dependency rules must be an array.');
  }

  for (const [index, rule] of dependencyRules.entries()) {
    if (!rule || typeof rule !== 'object') {
      throw new Error(`Dependency rule ${index} must be an object.`);
    }

    for (const trigger of ['whenVisible', 'whenRequired']) {
      if (rule[trigger] && !fieldsByKey.has(rule[trigger])) {
        throw new Error(`Dependency rule ${index} references unknown ${trigger} field: ${rule[trigger]}`);
      }
    }

    for (const targetList of ['forceVisible', 'forceRequired']) {
      if (!rule[targetList]) {
        continue;
      }

      if (!Array.isArray(rule[targetList]) || rule[targetList].length === 0) {
        throw new Error(`Dependency rule ${index} must define a non-empty ${targetList} array.`);
      }

      for (const targetKey of rule[targetList]) {
        if (!fieldsByKey.has(targetKey)) {
          throw new Error(`Dependency rule ${index} references unknown ${targetList} field: ${targetKey}`);
        }
      }
    }
  }

  return true;
}

const UNIT_FORM_FIELDS_BY_KEY = new Map(
  UNIT_FORM_FIELD_REGISTRY.map((field) => [field.key, field])
);

function getUnitFormFieldDefinition(fieldKey) {
  return UNIT_FORM_FIELDS_BY_KEY.get(String(fieldKey || '').trim()) || null;
}

function listLotConfigurableUnitFormFields() {
  return UNIT_FORM_FIELD_REGISTRY.filter((field) => field.enabledForLotRules);
}

function listUnitFormFieldsBySection(sectionKey) {
  return UNIT_FORM_FIELD_REGISTRY.filter((field) => field.section === sectionKey);
}

assertValidUnitFormFieldRegistry();

module.exports = {
  AVAILABILITY,
  FIELD_DEPENDENCY_RULES,
  PRESERVATION,
  REQUIREMENT,
  RULE_TYPE,
  UNIT_FORM_FIELD_REGISTRY,
  UNIT_FORM_SECTIONS,
  VISIBILITY,
  assertValidUnitFormFieldRegistry,
  getUnitFormFieldDefinition,
  listLotConfigurableUnitFormFields,
  listUnitFormFieldsBySection
};
