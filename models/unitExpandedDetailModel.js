const { pool } = require('./db');
const EXPANDED_TABLES = [
  'unit_identifiers',
  'unit_specifications',
  'unit_field_sources',
  'unit_grade_assessments',
  'unit_memory_modules',
  'unit_storage_devices',
  'unit_cellular_modules',
  'unit_cellular_module_bands',
  'unit_graphics_adapters',
  'unit_issue_entries',
  'unit_comments'
];
function normalizeUnitIds(unitIds) {
  return Array.from(
    new Set(
      (unitIds || [])
        .map((unitId) => Number(unitId))
        .filter((unitId) => Number.isInteger(unitId) && unitId > 0)
    )
  );
}
function buildPlaceholders(values) {
  return values.map(() => '?').join(', ');
}
function createEmptyDetails() {
  return {
    schemaReady: false,
    hasAnyExpandedData: false,
    identifiers: [],
    specifications: null,
    fieldSources: [],
    currentGrade: null,
    gradeHistory: [],
    memoryModules: [],
    memoryHistory: [],
    memoryTotalGb: 0,
    storageDevices: [],
    storageHistory: [],
    storageTotalGb: 0,
    cellularModules: [],
    graphicsAdapters: [],
    cosmeticIssues: [],
    hardwareIssues: [],
    hardwareIssueHistory: [],
    cosmeticIssueHistory: [],
    comments: []
  };
}
function createDetailsMap(unitIds) {
  const detailsMap = new Map();
  unitIds.forEach((unitId) => {
    detailsMap.set(Number(unitId), createEmptyDetails());
  });
  return detailsMap;
}
function markHasData(details) {
  if (details) {
    details.hasAnyExpandedData = true;
  }
}
function addToUnitList(detailsMap, unitId, key, value) {
  const details = detailsMap.get(Number(unitId));
  if (!details || !Array.isArray(details[key])) {
    return;
  }
  details[key].push(value);
  markHasData(details);
}
function setForUnit(detailsMap, unitId, key, value) {
  const details = detailsMap.get(Number(unitId));
  if (!details) {
    return;
  }
  details[key] = value;
  markHasData(details);
}
function getPersonName(row, prefix) {
  const firstName = row[`${prefix}_first_name`];
  const lastName = row[`${prefix}_last_name`];
  const email = row[`${prefix}_email`];
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || email || '';
}
function labelOrDash(value) {
  return value || '—';
}

function getMemoryInstallTypeLabel(value) {
  if (value === 'integrated_soldered') {
    return 'Integrated / Soldered';
  }

  if (value === 'unknown') {
    return 'Unknown';
  }

  return 'Removable Module';
}
async function getExistingExpandedTables() {
  const [rows] = await pool.query(
    `
      SELECT TABLE_NAME AS table_name
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${buildPlaceholders(EXPANDED_TABLES)})
    `,
    EXPANDED_TABLES
  );
  return new Set(rows.map((row) => row.table_name));
}
async function attachIdentifiers(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_identifiers')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        ui.unit_id,
        ui.identifier_value,
        ui.normalized_value,
        ui.is_primary,
        ui.created_at,
        identifier_type.code AS identifier_type_code,
        COALESCE(identifier_type.label, identifier_type.code) AS identifier_type_label
      FROM unit_identifiers ui
      LEFT JOIN config_values identifier_type
        ON identifier_type.config_value_id = ui.identifier_type_config_value_id
      WHERE ui.unit_id IN (${buildPlaceholders(unitIds)})
      ORDER BY ui.unit_id, ui.is_primary DESC, identifier_type.sort_order, identifier_type.label, ui.identifier_value
    `,
    unitIds
  );
  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, 'identifiers', {
      typeCode: row.identifier_type_code || '',
      typeLabel: row.identifier_type_label || 'Identifier',
      value: row.identifier_value || '',
      normalizedValue: row.normalized_value || '',
      isPrimary: Number(row.is_primary) === 1,
      createdAt: row.created_at
    });
  });
}
async function attachSpecifications(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_specifications')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        us.unit_id,
        us.bios_version,
        us.os_build,
        absolute_status.label AS absolute_status_label,
        camera_status.label AS physical_camera_status_label,
        touchscreen_status.label AS touchscreen_status_label,
        keyboard_language.label AS keyboard_language_label,
        diagnostics_status.label AS complete_diagnostics_status_label,
        virus_status.label AS virus_check_status_label,
        driver_status.label AS driver_check_status_label,
        skinned_status.label AS skinned_status_label,
        created_by.first_name AS created_by_first_name,
        created_by.last_name AS created_by_last_name,
        created_by.email AS created_by_email,
        updated_by.first_name AS updated_by_first_name,
        updated_by.last_name AS updated_by_last_name,
        updated_by.email AS updated_by_email,
        us.created_at,
        us.updated_at
      FROM unit_specifications us
      LEFT JOIN config_values absolute_status
        ON absolute_status.config_value_id = us.absolute_status_config_value_id
      LEFT JOIN config_values camera_status
        ON camera_status.config_value_id = us.physical_camera_status_config_value_id
      LEFT JOIN config_values touchscreen_status
        ON touchscreen_status.config_value_id = us.touchscreen_status_config_value_id
      LEFT JOIN config_values keyboard_language
        ON keyboard_language.config_value_id = us.keyboard_language_config_value_id
      LEFT JOIN config_values diagnostics_status
        ON diagnostics_status.config_value_id = us.complete_diagnostics_status_config_value_id
      LEFT JOIN config_values virus_status
        ON virus_status.config_value_id = us.virus_check_status_config_value_id
      LEFT JOIN config_values driver_status
        ON driver_status.config_value_id = us.driver_check_status_config_value_id
      LEFT JOIN config_values skinned_status
        ON skinned_status.config_value_id = us.skinned_status_config_value_id
      LEFT JOIN users created_by
        ON created_by.user_id = us.created_by_user_id
      LEFT JOIN users updated_by
        ON updated_by.user_id = us.updated_by_user_id
      WHERE us.unit_id IN (${buildPlaceholders(unitIds)})
    `,
    unitIds
  );
  rows.forEach((row) => {
    setForUnit(detailsMap, row.unit_id, 'specifications', {
      biosVersion: row.bios_version || '',
      osBuild: row.os_build || '',
      absoluteStatusLabel: labelOrDash(row.absolute_status_label),
      physicalCameraStatusLabel: labelOrDash(row.physical_camera_status_label),
      touchscreenStatusLabel: labelOrDash(row.touchscreen_status_label),
      keyboardLanguageLabel: labelOrDash(row.keyboard_language_label),
      completeDiagnosticsStatusLabel: labelOrDash(row.complete_diagnostics_status_label),
      virusCheckStatusLabel: labelOrDash(row.virus_check_status_label),
      driverCheckStatusLabel: labelOrDash(row.driver_check_status_label),
      skinnedStatusLabel: labelOrDash(row.skinned_status_label),
      createdByName: getPersonName(row, 'created_by'),
      updatedByName: getPersonName(row, 'updated_by'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  });
}
async function attachFieldSources(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_field_sources')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        ufs.unit_id,
        ufs.field_key,
        ufs.source_code,
        ufs.source_note,
        ufs.updated_at,
        updated_by.first_name AS updated_by_first_name,
        updated_by.last_name AS updated_by_last_name,
        updated_by.email AS updated_by_email
      FROM unit_field_sources ufs
      LEFT JOIN users updated_by
        ON updated_by.user_id = ufs.updated_by_user_id
      WHERE ufs.unit_id IN (${buildPlaceholders(unitIds)})
      ORDER BY ufs.unit_id, ufs.field_key
    `,
    unitIds
  );
  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, 'fieldSources', {
      fieldKey: row.field_key,
      sourceCode: row.source_code,
      sourceNote: row.source_note || '',
      updatedByName: getPersonName(row, 'updated_by'),
      updatedAt: row.updated_at
    });
  });
}
async function attachCurrentGrades(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_grade_assessments')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          uga.unit_grade_assessment_id,
          uga.unit_id,
          uga.is_current,
          uga.source_code,
          uga.assessed_at,
          uga.notes,
          grade.code AS grade_code,
          COALESCE(grade.label, grade.code) AS grade_label,
          assessed_by.first_name AS assessed_by_first_name,
          assessed_by.last_name AS assessed_by_last_name,
          assessed_by.email AS assessed_by_email,
          ROW_NUMBER() OVER (
            PARTITION BY uga.unit_id
            ORDER BY uga.assessed_at DESC, uga.unit_grade_assessment_id DESC
          ) AS row_rank
        FROM unit_grade_assessments uga
        LEFT JOIN config_values grade
          ON grade.config_value_id = uga.overall_grade_config_value_id
        LEFT JOIN users assessed_by
          ON assessed_by.user_id = uga.assessed_by_user_id
        WHERE uga.unit_id IN (${buildPlaceholders(unitIds)})
          AND uga.is_current = 1
      ) ranked_grades
      WHERE row_rank = 1
    `,
    unitIds
  );
  rows.forEach((row) => {
    setForUnit(detailsMap, row.unit_id, 'currentGrade', {
      gradeCode: row.grade_code || '',
      gradeLabel: row.grade_label || '—',
      sourceCode: row.source_code || '',
      assessedByName: getPersonName(row, 'assessed_by'),
      assessedAt: row.assessed_at,
      notes: row.notes || ''
    });
  });
}
async function attachMemoryModules(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_memory_modules')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        umm.unit_id,
        umm.slot_label,
        umm.size_gb,
        ram_type.label AS ram_type_label,
        COALESCE(umm.memory_install_type_code, 'removable_module') AS memory_install_type_code,
        umm.speed_mhz,
        umm.manufacturer_name,
        umm.part_number,
        umm.serial_number,
        umm.is_current,
        umm.installed_at,
        umm.removed_at,
        change_reason.label AS change_reason_label,
        umm.change_notes,
        umm.source_code,
        changed_by.first_name AS changed_by_first_name,
        changed_by.last_name AS changed_by_last_name,
        changed_by.email AS changed_by_email
      FROM unit_memory_modules umm
      LEFT JOIN config_values ram_type
        ON ram_type.config_value_id = umm.ram_type_config_value_id
      LEFT JOIN config_values change_reason
        ON change_reason.config_value_id = umm.change_reason_config_value_id
      LEFT JOIN users changed_by
        ON changed_by.user_id = umm.changed_by_user_id
      WHERE umm.unit_id IN (${buildPlaceholders(unitIds)})
        AND umm.is_current = 1
      ORDER BY umm.unit_id, umm.slot_label, umm.unit_memory_module_id
    `,
    unitIds
  );
  rows.forEach((row) => {
    const sizeGb = row.size_gb ? Number(row.size_gb) : 0;
    const details = detailsMap.get(Number(row.unit_id));
    if (details) {
      details.memoryTotalGb += sizeGb;
    }
    addToUnitList(detailsMap, row.unit_id, 'memoryModules', {
      slotLabel: row.slot_label || 'Slot',
      sizeGb: row.size_gb || '',
      ramTypeLabel: row.ram_type_label || '',
      memoryInstallTypeCode: row.memory_install_type_code || 'removable_module',
      memoryInstallTypeLabel: getMemoryInstallTypeLabel(row.memory_install_type_code),
      speedMhz: row.speed_mhz || '',
      manufacturerName: row.manufacturer_name || '',
      partNumber: row.part_number || '',
      serialNumber: row.serial_number || '',
      sourceCode: row.source_code || '',
      changedByName: getPersonName(row, 'changed_by'),
      changeReasonLabel: row.change_reason_label || '',
      changeNotes: row.change_notes || '',
      installedAt: row.installed_at,
      removedAt: row.removed_at
    });
  });
}
async function attachStorageDevices(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_storage_devices')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        usd.unit_id,
        usd.slot_label,
        storage_type.label AS storage_type_label,
        usd.size_gb,
        usd.manufacturer_name,
        usd.model_number,
        usd.serial_number,
        usd.firmware_version,
        wipe_status.label AS wipe_status_label,
        usd.wiped_at,
        usd.is_current,
        usd.installed_at,
        usd.removed_at,
        change_reason.label AS change_reason_label,
        usd.change_notes,
        usd.source_code,
        wiped_by.first_name AS wiped_by_first_name,
        wiped_by.last_name AS wiped_by_last_name,
        wiped_by.email AS wiped_by_email,
        changed_by.first_name AS changed_by_first_name,
        changed_by.last_name AS changed_by_last_name,
        changed_by.email AS changed_by_email
      FROM unit_storage_devices usd
      LEFT JOIN config_values storage_type
        ON storage_type.config_value_id = usd.storage_type_config_value_id
      LEFT JOIN config_values wipe_status
        ON wipe_status.config_value_id = usd.wipe_status_config_value_id
      LEFT JOIN config_values change_reason
        ON change_reason.config_value_id = usd.change_reason_config_value_id
      LEFT JOIN users wiped_by
        ON wiped_by.user_id = usd.wiped_by_user_id
      LEFT JOIN users changed_by
        ON changed_by.user_id = usd.changed_by_user_id
      WHERE usd.unit_id IN (${buildPlaceholders(unitIds)})
        AND usd.is_current = 1
      ORDER BY usd.unit_id, usd.slot_label, usd.unit_storage_device_id
    `,
    unitIds
  );
  rows.forEach((row) => {
    const sizeGb = row.size_gb ? Number(row.size_gb) : 0;
    const details = detailsMap.get(Number(row.unit_id));
    if (details) {
      details.storageTotalGb += sizeGb;
    }
    addToUnitList(detailsMap, row.unit_id, 'storageDevices', {
      slotLabel: row.slot_label || 'Drive',
      storageTypeLabel: row.storage_type_label || '',
      sizeGb: row.size_gb || '',
      manufacturerName: row.manufacturer_name || '',
      modelNumber: row.model_number || '',
      serialNumber: row.serial_number || '',
      firmwareVersion: row.firmware_version || '',
      wipeStatusLabel: row.wipe_status_label || '—',
      wipedByName: getPersonName(row, 'wiped_by'),
      wipedAt: row.wiped_at,
      sourceCode: row.source_code || '',
      changedByName: getPersonName(row, 'changed_by'),
      changeReasonLabel: row.change_reason_label || '',
      changeNotes: row.change_notes || '',
      installedAt: row.installed_at,
      removedAt: row.removed_at
    });
  });
}
async function attachCellularModules(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_cellular_modules')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        ucm.unit_cellular_module_id,
        ucm.unit_id,
        wwan_status.label AS wwan_status_label,
        ucm.module_manufacturer,
        ucm.module_model,
        ucm.imei,
        ucm.firmware_version,
        ucm.supported_networks_text,
        ucm.supported_carriers_text,
        ucm.notes,
        ucm.is_current,
        ucm.installed_at,
        ucm.removed_at,
        change_reason.label AS change_reason_label,
        ucm.source_code,
        changed_by.first_name AS changed_by_first_name,
        changed_by.last_name AS changed_by_last_name,
        changed_by.email AS changed_by_email
      FROM unit_cellular_modules ucm
      LEFT JOIN config_values wwan_status
        ON wwan_status.config_value_id = ucm.wwan_status_config_value_id
      LEFT JOIN config_values change_reason
        ON change_reason.config_value_id = ucm.change_reason_config_value_id
      LEFT JOIN users changed_by
        ON changed_by.user_id = ucm.changed_by_user_id
      WHERE ucm.unit_id IN (${buildPlaceholders(unitIds)})
        AND ucm.is_current = 1
      ORDER BY ucm.unit_id, ucm.unit_cellular_module_id
    `,
    unitIds
  );
  const modulesById = new Map();
  const moduleIds = [];
  rows.forEach((row) => {
    const module = {
      unitCellularModuleId: Number(row.unit_cellular_module_id),
      wwanStatusLabel: row.wwan_status_label || '—',
      moduleManufacturer: row.module_manufacturer || '',
      moduleModel: row.module_model || '',
      imei: row.imei || '',
      firmwareVersion: row.firmware_version || '',
      supportedNetworksText: row.supported_networks_text || '',
      supportedCarriersText: row.supported_carriers_text || '',
      notes: row.notes || '',
      bands: [],
      bandSummary: '',
      sourceCode: row.source_code || '',
      changedByName: getPersonName(row, 'changed_by'),
      changeReasonLabel: row.change_reason_label || '',
      installedAt: row.installed_at,
      removedAt: row.removed_at
    };
    moduleIds.push(Number(row.unit_cellular_module_id));
    modulesById.set(Number(row.unit_cellular_module_id), module);
    addToUnitList(detailsMap, row.unit_id, 'cellularModules', module);
  });
  if (!existingTables.has('unit_cellular_module_bands') || moduleIds.length === 0) {
    return;
  }
  const [bandRows] = await pool.query(
    `
      SELECT
        ucmb.unit_cellular_module_id,
        network_type.label AS network_type_label,
        network_type.code AS network_type_code,
        ucmb.band_code,
        ucmb.frequency_label,
        ucmb.region_note,
        ucmb.source_code
      FROM unit_cellular_module_bands ucmb
      LEFT JOIN config_values network_type
        ON network_type.config_value_id = ucmb.network_type_config_value_id
      WHERE ucmb.unit_cellular_module_id IN (${buildPlaceholders(moduleIds)})
      ORDER BY ucmb.unit_cellular_module_id, network_type.sort_order, ucmb.band_code
    `,
    moduleIds
  );
  bandRows.forEach((row) => {
    const module = modulesById.get(Number(row.unit_cellular_module_id));
    if (!module) {
      return;
    }
    module.bands.push({
      networkTypeLabel: row.network_type_label || row.network_type_code || 'Network',
      bandCode: row.band_code,
      frequencyLabel: row.frequency_label || '',
      regionNote: row.region_note || '',
      sourceCode: row.source_code || ''
    });
  });
  modulesById.forEach((module) => {
    module.bandSummary = module.bands.map((band) => band.bandCode).filter(Boolean).join(', ');
  });
}
async function attachGraphicsAdapters(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_graphics_adapters')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        uga.unit_id,
        gpu_type.label AS gpu_type_label,
        uga.gpu_model,
        uga.vram_mb,
        uga.is_current,
        uga.source_code,
        created_by.first_name AS created_by_first_name,
        created_by.last_name AS created_by_last_name,
        created_by.email AS created_by_email,
        updated_by.first_name AS updated_by_first_name,
        updated_by.last_name AS updated_by_last_name,
        updated_by.email AS updated_by_email,
        uga.created_at,
        uga.updated_at
      FROM unit_graphics_adapters uga
      LEFT JOIN config_values gpu_type
        ON gpu_type.config_value_id = uga.gpu_type_config_value_id
      LEFT JOIN users created_by
        ON created_by.user_id = uga.created_by_user_id
      LEFT JOIN users updated_by
        ON updated_by.user_id = uga.updated_by_user_id
      WHERE uga.unit_id IN (${buildPlaceholders(unitIds)})
        AND uga.is_current = 1
      ORDER BY uga.unit_id, gpu_type.sort_order, uga.gpu_model
    `,
    unitIds
  );
  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, 'graphicsAdapters', {
      gpuTypeLabel: row.gpu_type_label || '—',
      gpuModel: row.gpu_model || '',
      vramMb: row.vram_mb || '',
      sourceCode: row.source_code || '',
      createdByName: getPersonName(row, 'created_by'),
      updatedByName: getPersonName(row, 'updated_by'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  });
}
async function attachIssueEntries(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_issue_entries')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT
        uie.unit_id,
        uie.issue_area,
        issue_type.label AS issue_type_label,
        uie.custom_issue_label,
        severity.label AS severity_label,
        location.label AS location_label,
        uie.issue_remark,
        uie.source_code,
        created_by.first_name AS created_by_first_name,
        created_by.last_name AS created_by_last_name,
        created_by.email AS created_by_email,
        updated_by.first_name AS updated_by_first_name,
        updated_by.last_name AS updated_by_last_name,
        updated_by.email AS updated_by_email,
        uie.created_at,
        uie.updated_at
      FROM unit_issue_entries uie
      LEFT JOIN config_values issue_type
        ON issue_type.config_value_id = uie.issue_type_config_value_id
      LEFT JOIN config_values severity
        ON severity.config_value_id = uie.severity_config_value_id
      LEFT JOIN config_values location
        ON location.config_value_id = uie.location_config_value_id
      LEFT JOIN users created_by
        ON created_by.user_id = uie.created_by_user_id
      LEFT JOIN users updated_by
        ON updated_by.user_id = uie.updated_by_user_id
      WHERE uie.unit_id IN (${buildPlaceholders(unitIds)})
        AND uie.is_current = 1
      ORDER BY uie.unit_id, uie.issue_area, uie.created_at DESC, uie.unit_issue_entry_id DESC
    `,
    unitIds
  );
  rows.forEach((row) => {
    const issue = {
      issueArea: row.issue_area,
      issueLabel: row.custom_issue_label || row.issue_type_label || 'Issue',
      configuredIssueLabel: row.issue_type_label || '',
      customIssueLabel: row.custom_issue_label || '',
      severityLabel: row.severity_label || '',
      locationLabel: row.location_label || '',
      issueRemark: row.issue_remark || '',
      sourceCode: row.source_code || '',
      createdByName: getPersonName(row, 'created_by'),
      updatedByName: getPersonName(row, 'updated_by'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    if (row.issue_area === 'hardware') {
      addToUnitList(detailsMap, row.unit_id, 'hardwareIssues', issue);
    } else {
      addToUnitList(detailsMap, row.unit_id, 'cosmeticIssues', issue);
    }
  });
}
async function attachGradeHistory(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_grade_assessments')) {
    return;
  }

  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          uga.unit_grade_assessment_id,
          uga.unit_id,
          uga.is_current,
          uga.source_code,
          uga.assessed_at,
          uga.notes,
          grade.code AS grade_code,
          COALESCE(grade.label, grade.code) AS grade_label,
          assessed_by.first_name AS assessed_by_first_name,
          assessed_by.last_name AS assessed_by_last_name,
          assessed_by.email AS assessed_by_email,
          ROW_NUMBER() OVER (
            PARTITION BY uga.unit_id
            ORDER BY uga.assessed_at DESC, uga.unit_grade_assessment_id DESC
          ) AS row_rank
        FROM unit_grade_assessments uga
        LEFT JOIN config_values grade
          ON grade.config_value_id = uga.overall_grade_config_value_id
        LEFT JOIN users assessed_by
          ON assessed_by.user_id = uga.assessed_by_user_id
        WHERE uga.unit_id IN (${buildPlaceholders(unitIds)})
      ) ranked_grades
      WHERE row_rank <= 25
      ORDER BY unit_id, assessed_at DESC, unit_grade_assessment_id DESC
    `,
    unitIds
  );

  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, 'gradeHistory', {
      gradeCode: row.grade_code || '',
      gradeLabel: row.grade_label || '—',
      isCurrent: Number(row.is_current) === 1,
      sourceCode: row.source_code || '',
      assessedByName: getPersonName(row, 'assessed_by'),
      assessedAt: row.assessed_at,
      notes: row.notes || ''
    });
  });
}

async function attachMemoryHistory(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_memory_modules')) {
    return;
  }

  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          umm.unit_memory_module_id,
          umm.unit_id,
          umm.slot_label,
          umm.size_gb,
          ram_type.label AS ram_type_label,
          COALESCE(umm.memory_install_type_code, 'removable_module') AS memory_install_type_code,
          umm.speed_mhz,
          umm.manufacturer_name,
          umm.part_number,
          umm.serial_number,
          umm.is_current,
          umm.installed_at,
          umm.removed_at,
          change_reason.label AS change_reason_label,
          umm.change_notes,
          umm.source_code,
          umm.created_at,
          umm.updated_at,
          changed_by.first_name AS changed_by_first_name,
          changed_by.last_name AS changed_by_last_name,
          changed_by.email AS changed_by_email,
          ROW_NUMBER() OVER (
            PARTITION BY umm.unit_id
            ORDER BY COALESCE(umm.updated_at, umm.installed_at, umm.created_at) DESC, umm.unit_memory_module_id DESC
          ) AS row_rank
        FROM unit_memory_modules umm
        LEFT JOIN config_values ram_type
          ON ram_type.config_value_id = umm.ram_type_config_value_id
        LEFT JOIN config_values change_reason
          ON change_reason.config_value_id = umm.change_reason_config_value_id
        LEFT JOIN users changed_by
          ON changed_by.user_id = umm.changed_by_user_id
        WHERE umm.unit_id IN (${buildPlaceholders(unitIds)})
      ) ranked_memory
      WHERE row_rank <= 25
      ORDER BY unit_id, COALESCE(updated_at, installed_at, created_at) DESC, unit_memory_module_id DESC
    `,
    unitIds
  );

  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, 'memoryHistory', {
      slotLabel: row.slot_label || 'Slot',
      sizeGb: row.size_gb || '',
      ramTypeLabel: row.ram_type_label || '',
      memoryInstallTypeCode: row.memory_install_type_code || 'removable_module',
      memoryInstallTypeLabel: getMemoryInstallTypeLabel(row.memory_install_type_code),
      speedMhz: row.speed_mhz || '',
      manufacturerName: row.manufacturer_name || '',
      partNumber: row.part_number || '',
      serialNumber: row.serial_number || '',
      isCurrent: Number(row.is_current) === 1,
      sourceCode: row.source_code || '',
      changedByName: getPersonName(row, 'changed_by'),
      changeReasonLabel: row.change_reason_label || '',
      changeNotes: row.change_notes || '',
      installedAt: row.installed_at,
      removedAt: row.removed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  });
}

async function attachStorageHistory(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_storage_devices')) {
    return;
  }

  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          usd.unit_storage_device_id,
          usd.unit_id,
          usd.slot_label,
          storage_type.label AS storage_type_label,
          usd.size_gb,
          usd.manufacturer_name,
          usd.model_number,
          usd.serial_number,
          usd.firmware_version,
          wipe_status.label AS wipe_status_label,
          wiped_by.first_name AS wiped_by_first_name,
          wiped_by.last_name AS wiped_by_last_name,
          wiped_by.email AS wiped_by_email,
          usd.wiped_at,
          usd.is_current,
          usd.installed_at,
          usd.removed_at,
          change_reason.label AS change_reason_label,
          usd.change_notes,
          usd.source_code,
          usd.created_at,
          usd.updated_at,
          changed_by.first_name AS changed_by_first_name,
          changed_by.last_name AS changed_by_last_name,
          changed_by.email AS changed_by_email,
          ROW_NUMBER() OVER (
            PARTITION BY usd.unit_id
            ORDER BY COALESCE(usd.updated_at, usd.installed_at, usd.created_at) DESC, usd.unit_storage_device_id DESC
          ) AS row_rank
        FROM unit_storage_devices usd
        LEFT JOIN config_values storage_type
          ON storage_type.config_value_id = usd.storage_type_config_value_id
        LEFT JOIN config_values wipe_status
          ON wipe_status.config_value_id = usd.wipe_status_config_value_id
        LEFT JOIN config_values change_reason
          ON change_reason.config_value_id = usd.change_reason_config_value_id
        LEFT JOIN users wiped_by
          ON wiped_by.user_id = usd.wiped_by_user_id
        LEFT JOIN users changed_by
          ON changed_by.user_id = usd.changed_by_user_id
        WHERE usd.unit_id IN (${buildPlaceholders(unitIds)})
      ) ranked_storage
      WHERE row_rank <= 25
      ORDER BY unit_id, COALESCE(updated_at, installed_at, created_at) DESC, unit_storage_device_id DESC
    `,
    unitIds
  );

  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, 'storageHistory', {
      slotLabel: row.slot_label || 'Drive',
      storageTypeLabel: row.storage_type_label || '',
      sizeGb: row.size_gb || '',
      manufacturerName: row.manufacturer_name || '',
      modelNumber: row.model_number || '',
      serialNumber: row.serial_number || '',
      firmwareVersion: row.firmware_version || '',
      wipeStatusLabel: row.wipe_status_label || '—',
      wipedByName: getPersonName(row, 'wiped_by'),
      wipedAt: row.wiped_at,
      isCurrent: Number(row.is_current) === 1,
      sourceCode: row.source_code || '',
      changedByName: getPersonName(row, 'changed_by'),
      changeReasonLabel: row.change_reason_label || '',
      changeNotes: row.change_notes || '',
      installedAt: row.installed_at,
      removedAt: row.removed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  });
}

async function attachIssueHistory(detailsMap, unitIds, existingTables, issueArea, targetKey, fallbackLabel) {
  if (!existingTables.has('unit_issue_entries')) {
    return;
  }

  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          uie.unit_issue_entry_id,
          uie.unit_id,
          uie.issue_area,
          uie.is_current,
          issue_type.label AS issue_type_label,
          severity.label AS severity_label,
          uie.custom_issue_label,
          location.label AS location_label,
          uie.issue_remark,
          uie.source_code,
          created_by.first_name AS created_by_first_name,
          created_by.last_name AS created_by_last_name,
          created_by.email AS created_by_email,
          updated_by.first_name AS updated_by_first_name,
          updated_by.last_name AS updated_by_last_name,
          updated_by.email AS updated_by_email,
          uie.created_at,
          uie.updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY uie.unit_id
            ORDER BY COALESCE(uie.updated_at, uie.created_at) DESC, uie.unit_issue_entry_id DESC
          ) AS row_rank
        FROM unit_issue_entries uie
        LEFT JOIN config_values issue_type
          ON issue_type.config_value_id = uie.issue_type_config_value_id
        LEFT JOIN config_values severity
          ON severity.config_value_id = uie.severity_config_value_id
        LEFT JOIN config_values location
          ON location.config_value_id = uie.location_config_value_id
        LEFT JOIN users created_by
          ON created_by.user_id = uie.created_by_user_id
        LEFT JOIN users updated_by
          ON updated_by.user_id = uie.updated_by_user_id
        WHERE uie.issue_area = ?
          AND uie.unit_id IN (${buildPlaceholders(unitIds)})
      ) ranked_issue_history
      WHERE row_rank <= 25
      ORDER BY unit_id, COALESCE(updated_at, created_at) DESC, unit_issue_entry_id DESC
    `,
    [issueArea, ...unitIds]
  );

  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, targetKey, {
      issueArea: row.issue_area || issueArea,
      issueLabel: row.custom_issue_label || row.issue_type_label || fallbackLabel,
      configuredIssueLabel: row.issue_type_label || '',
      customIssueLabel: row.custom_issue_label || '',
      severityLabel: row.severity_label || '',
      locationLabel: row.location_label || '',
      issueRemark: row.issue_remark || '',
      isCurrent: Number(row.is_current) === 1,
      sourceCode: row.source_code || '',
      createdByName: getPersonName(row, 'created_by'),
      updatedByName: getPersonName(row, 'updated_by'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  });
}

async function attachHardwareIssueHistory(detailsMap, unitIds, existingTables) {
  return attachIssueHistory(detailsMap, unitIds, existingTables, 'hardware', 'hardwareIssueHistory', 'Hardware Issue');
}

async function attachCosmeticIssueHistory(detailsMap, unitIds, existingTables) {
  return attachIssueHistory(detailsMap, unitIds, existingTables, 'cosmetic', 'cosmeticIssueHistory', 'Cosmetic Issue');
}

async function attachComments(detailsMap, unitIds, existingTables) {
  if (!existingTables.has('unit_comments')) {
    return;
  }
  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          uc.unit_comment_id,
          uc.unit_id,
          note_type.label AS note_type_label,
          note_type.code AS note_type_code,
          uc.comment_text,
          uc.source_code,
          uc.created_at,
          created_by.first_name AS created_by_first_name,
          created_by.last_name AS created_by_last_name,
          created_by.email AS created_by_email,
          ROW_NUMBER() OVER (
            PARTITION BY uc.unit_id
            ORDER BY uc.created_at DESC, uc.unit_comment_id DESC
          ) AS row_rank
        FROM unit_comments uc
        LEFT JOIN config_values note_type
          ON note_type.config_value_id = uc.note_type_config_value_id
        LEFT JOIN users created_by
          ON created_by.user_id = uc.created_by_user_id
        WHERE uc.unit_id IN (${buildPlaceholders(unitIds)})
      ) ranked_comments
      WHERE row_rank <= 25
      ORDER BY unit_id, created_at DESC, unit_comment_id DESC
    `,
    unitIds
  );
  rows.forEach((row) => {
    addToUnitList(detailsMap, row.unit_id, 'comments', {
      noteTypeLabel: row.note_type_label || row.note_type_code || 'Comment',
      noteTypeCode: row.note_type_code || '',
      commentText: row.comment_text || '',
      sourceCode: row.source_code || '',
      createdByName: getPersonName(row, 'created_by'),
      createdAt: row.created_at
    });
  });
}
async function listExpandedDetailsForUnits(unitIds) {
  const safeUnitIds = normalizeUnitIds(unitIds);
  const detailsMap = createDetailsMap(safeUnitIds);
  if (safeUnitIds.length === 0) {
    return detailsMap;
  }
  const existingTables = await getExistingExpandedTables();
  const hasAnyExpandedTable = EXPANDED_TABLES.some((tableName) => existingTables.has(tableName));
  detailsMap.forEach((details) => {
    details.schemaReady = hasAnyExpandedTable;
  });
  await attachIdentifiers(detailsMap, safeUnitIds, existingTables);
  await attachSpecifications(detailsMap, safeUnitIds, existingTables);
  await attachFieldSources(detailsMap, safeUnitIds, existingTables);
  await attachCurrentGrades(detailsMap, safeUnitIds, existingTables);
  await attachMemoryModules(detailsMap, safeUnitIds, existingTables);
  await attachStorageDevices(detailsMap, safeUnitIds, existingTables);
  await attachCellularModules(detailsMap, safeUnitIds, existingTables);
  await attachGraphicsAdapters(detailsMap, safeUnitIds, existingTables);
  await attachIssueEntries(detailsMap, safeUnitIds, existingTables);
  await attachComments(detailsMap, safeUnitIds, existingTables);
  return detailsMap;
}
async function getHistoryDetailsForUnit(unitId) {
  const safeUnitIds = normalizeUnitIds([unitId]);
  const detailsMap = createDetailsMap(safeUnitIds);

  if (safeUnitIds.length === 0) {
    return createEmptyDetails();
  }

  const existingTables = await getExistingExpandedTables();
  const hasAnyExpandedTable = EXPANDED_TABLES.some((tableName) => existingTables.has(tableName));

  detailsMap.forEach((details) => {
    details.schemaReady = hasAnyExpandedTable;
  });

  await attachGradeHistory(detailsMap, safeUnitIds, existingTables);
  await attachMemoryHistory(detailsMap, safeUnitIds, existingTables);
  await attachStorageHistory(detailsMap, safeUnitIds, existingTables);
  await attachHardwareIssueHistory(detailsMap, safeUnitIds, existingTables);
  await attachCosmeticIssueHistory(detailsMap, safeUnitIds, existingTables);

  return detailsMap.get(safeUnitIds[0]) || createEmptyDetails();
}

module.exports = {
  listExpandedDetailsForUnits,
  getHistoryDetailsForUnit
};
