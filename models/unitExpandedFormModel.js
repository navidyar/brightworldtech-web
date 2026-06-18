const { pool } = require('./db');
const unitOutcomeModel = require('./unitOutcomeModel');

const DEFAULT_GRAPHICS_ROWS = [
  {
    gpuTypeConfigValueId: '',
    gpuModel: '',
    vramMb: ''
  }
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeNullableText(value, maxLength = 255) {
  const normalized = normalizeText(value);

  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeOptionalInteger(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalNonNegativeInteger(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeRows(rows) {
  if (!rows) {
    return [];
  }

  if (Array.isArray(rows)) {
    return rows.filter((row) => row && typeof row === 'object');
  }

  if (typeof rows === 'object') {
    return Object.keys(rows)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => rows[key])
      .filter((row) => row && typeof row === 'object');
  }

  return [];
}

function graphicsRowHasAnyValue(row) {
  return Boolean(
    normalizeText(row.gpuTypeConfigValueId) ||
      normalizeText(row.gpuModel) ||
      normalizeText(row.vramMb)
  );
}

async function tableExists(tableName, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0].table_count) > 0;
}

async function upsertFieldSource(connection, unitId, fieldKey, sourceCode, sourceNote, currentUserId) {
  if (!await tableExists('unit_field_sources', connection)) {
    return;
  }

  await connection.query(
    `
      INSERT INTO unit_field_sources (
        unit_id,
        field_key,
        source_code,
        source_note,
        updated_by_user_id,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        source_code = VALUES(source_code),
        source_note = VALUES(source_note),
        updated_by_user_id = VALUES(updated_by_user_id),
        updated_at = NOW()
    `,
    [
      unitId,
      fieldKey,
      sourceCode || 'tech_edit',
      sourceNote || null,
      normalizeOptionalInteger(currentUserId)
    ]
  );
}

async function upsertManualFieldSources(connection, unitId, fieldKeys, currentUserId) {
  for (const fieldKey of fieldKeys) {
    await upsertFieldSource(
      connection,
      unitId,
      fieldKey,
      'tech_edit',
      'Saved from Tech Unit form.',
      currentUserId
    );
  }
}

async function listConfigValuesByCategoryCodes(categoryCodes, connection = pool) {
  const safeCategoryCodes = categoryCodes.map((code) => normalizeText(code)).filter(Boolean);

  if (safeCategoryCodes.length === 0) {
    return [];
  }

  const categoryPlaceholders = safeCategoryCodes.map(() => '?').join(', ');
  const categoryOrderPlaceholders = safeCategoryCodes.map(() => '?').join(', ');

  const [rows] = await connection.query(
    `
      SELECT
        cc.code AS category_code,
        cv.config_value_id,
        cv.code,
        COALESCE(cv.label, cv.code) AS label,
        cv.value,
        cv.sort_order
      FROM config_categories cc
      INNER JOIN config_values cv
        ON cv.config_category_id = cc.config_category_id
      WHERE cc.code IN (${categoryPlaceholders})
        AND COALESCE(cc.is_active, 1) = 1
        AND COALESCE(cv.is_active, 1) = 1
      ORDER BY FIELD(cc.code, ${categoryOrderPlaceholders}), cv.sort_order, label, cv.code
    `,
    [...safeCategoryCodes, ...safeCategoryCodes]
  );

  return rows.map((row) => ({
    id: Number(row.config_value_id),
    categoryCode: row.category_code,
    code: row.code,
    label: row.label,
    value: row.value || row.code
  }));
}


function normalizeGradeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isNotYetGradedToken(value) {
  return ['n_a', 'na', 'not_applicable', 'not_yet_graded', 'not_graded', 'ungraded'].includes(normalizeGradeToken(value));
}

function normalizeOverallGradeOptions(options) {
  const safeOptions = Array.isArray(options) ? options : [];
  const seen = new Set();
  const normalizedOptions = [];

  safeOptions.forEach((option) => {
    const isNotYetGraded = [option.code, option.value, option.label].some(isNotYetGradedToken);
    const displayLabel = isNotYetGraded ? 'Not Yet Graded' : (option.label || option.code || option.value || '');
    const displayKey = isNotYetGraded ? 'not_yet_graded' : normalizeGradeToken(displayLabel);
    const fallbackKey = normalizeGradeToken(option.code || option.value || option.id || '');
    const dedupeKey = displayKey || fallbackKey || String(option.id || '');

    if (!dedupeKey || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);

    normalizedOptions.push({
      ...option,
      label: displayLabel
    });
  });

  return normalizedOptions;
}

function getBlankExpandedFormData() {
  return {
    overallGradeConfigValueId: '',
    overallGradeNotes: '',
    outcomeCode: '',
    outcomeNotes: '',
    outcomeApprovalRequested: false,
    outcomeApprovalRequestNotes: '',
    biosVersion: '',
    osBuild: '',
    absoluteStatusConfigValueId: '',
    physicalCameraStatusConfigValueId: '',
    touchscreenStatusConfigValueId: '',
    keyboardLanguageConfigValueId: '',
    completeDiagnosticsStatusConfigValueId: '',
    virusCheckStatusConfigValueId: '',
    driverCheckStatusConfigValueId: '',
    skinnedStatusConfigValueId: '',
    graphicsAdapters: DEFAULT_GRAPHICS_ROWS.map((row) => ({ ...row })),
    scanToolReadOnlyDetails: {
      cellularModules: []
    }
  };
}

async function getExpandedFormOptions() {
  const [
    rawOverallGradeOptions,
    absoluteStatusOptions,
    physicalCameraStatusOptions,
    touchscreenStatusOptions,
    keyboardLanguageOptions,
    diagnosticsStatusOptions,
    virusCheckStatusOptions,
    driverCheckStatusOptions,
    skinnedStatusOptions,
    gpuTypeOptions
  ] = await Promise.all([
    listConfigValuesByCategoryCodes(['overall_unit_grades', 'unit_grades', 'unit_grade']),
    listConfigValuesByCategoryCodes(['absolute_statuses', 'absolute_status']),
    listConfigValuesByCategoryCodes(['physical_camera_statuses', 'camera_statuses', 'physical_camera_status']),
    listConfigValuesByCategoryCodes(['touchscreen_statuses', 'touchscreen_status']),
    listConfigValuesByCategoryCodes(['keyboard_languages', 'keyboard_language']),
    listConfigValuesByCategoryCodes(['diagnostics_statuses', 'complete_diagnostics_statuses', 'diagnostics_status']),
    listConfigValuesByCategoryCodes(['virus_check_statuses', 'virus_check_status']),
    listConfigValuesByCategoryCodes(['driver_check_statuses', 'driver_check_status']),
    listConfigValuesByCategoryCodes(['skinned_statuses', 'skinned_status']),
    listConfigValuesByCategoryCodes(['gpu_types', 'gpu_type', 'graphics_adapter_types'])
  ]);

  return {
    expandedOptionsSupported: await tableExists('unit_specifications'),
    gradeOptionsSupported: await tableExists('unit_grade_assessments'),
    outcomeOptionsSupported: await unitOutcomeModel.tableExists(),
    outcomeOptions: [
      { code: 'pass', label: 'Pass' },
      { code: 'fail', label: 'Fail' }
    ],
    graphicsOptionsSupported: await tableExists('unit_graphics_adapters'),
    overallGradeOptions: normalizeOverallGradeOptions(rawOverallGradeOptions),
    absoluteStatusOptions,
    physicalCameraStatusOptions,
    touchscreenStatusOptions,
    keyboardLanguageOptions,
    diagnosticsStatusOptions,
    virusCheckStatusOptions,
    driverCheckStatusOptions,
    skinnedStatusOptions,
    gpuTypeOptions
  };
}

async function getUnitSpecificationFormData(unitId) {
  const blankData = getBlankExpandedFormData();

  if (!await tableExists('unit_specifications')) {
    return blankData;
  }

  const [rows] = await pool.query(
    `
      SELECT
        bios_version,
        os_build,
        absolute_status_config_value_id,
        physical_camera_status_config_value_id,
        touchscreen_status_config_value_id,
        keyboard_language_config_value_id,
        complete_diagnostics_status_config_value_id,
        virus_check_status_config_value_id,
        driver_check_status_config_value_id,
        skinned_status_config_value_id
      FROM unit_specifications
      WHERE unit_id = ?
      LIMIT 1
    `,
    [unitId]
  );

  const row = rows[0];

  if (!row) {
    return blankData;
  }

  return {
    ...blankData,
    biosVersion: row.bios_version || '',
    osBuild: row.os_build || '',
    absoluteStatusConfigValueId: row.absolute_status_config_value_id ? String(row.absolute_status_config_value_id) : '',
    physicalCameraStatusConfigValueId: row.physical_camera_status_config_value_id ? String(row.physical_camera_status_config_value_id) : '',
    touchscreenStatusConfigValueId: row.touchscreen_status_config_value_id ? String(row.touchscreen_status_config_value_id) : '',
    keyboardLanguageConfigValueId: row.keyboard_language_config_value_id ? String(row.keyboard_language_config_value_id) : '',
    completeDiagnosticsStatusConfigValueId: row.complete_diagnostics_status_config_value_id ? String(row.complete_diagnostics_status_config_value_id) : '',
    virusCheckStatusConfigValueId: row.virus_check_status_config_value_id ? String(row.virus_check_status_config_value_id) : '',
    driverCheckStatusConfigValueId: row.driver_check_status_config_value_id ? String(row.driver_check_status_config_value_id) : '',
    skinnedStatusConfigValueId: row.skinned_status_config_value_id ? String(row.skinned_status_config_value_id) : ''
  };
}

async function getCurrentGradeFormData(unitId) {
  if (!await tableExists('unit_grade_assessments')) {
    return {
      overallGradeConfigValueId: '',
      overallGradeNotes: ''
    };
  }

  const [rows] = await pool.query(
    `
      SELECT overall_grade_config_value_id, notes
      FROM unit_grade_assessments
      WHERE unit_id = ?
        AND is_current = 1
      ORDER BY assessed_at DESC, unit_grade_assessment_id DESC
      LIMIT 1
    `,
    [unitId]
  );

  const row = rows[0];

  return {
    overallGradeConfigValueId: row && row.overall_grade_config_value_id ? String(row.overall_grade_config_value_id) : '',
    overallGradeNotes: row && row.notes ? row.notes : ''
  };
}

async function getCurrentOutcomeFormData(unitId) {
  return unitOutcomeModel.getOutcomeFormDataByUnitId(unitId);
}

async function getGraphicsFormData(unitId) {
  if (!await tableExists('unit_graphics_adapters')) {
    return {
      graphicsAdapters: DEFAULT_GRAPHICS_ROWS.map((row) => ({ ...row }))
    };
  }

  const [rows] = await pool.query(
    `
      SELECT gpu_type_config_value_id, gpu_model, vram_mb
      FROM unit_graphics_adapters
      WHERE unit_id = ?
        AND is_current = 1
      ORDER BY unit_graphics_adapter_id
    `,
    [unitId]
  );

  if (rows.length === 0) {
    return {
      graphicsAdapters: DEFAULT_GRAPHICS_ROWS.map((row) => ({ ...row }))
    };
  }

  return {
    graphicsAdapters: rows.map((row) => ({
      gpuTypeConfigValueId: row.gpu_type_config_value_id ? String(row.gpu_type_config_value_id) : '',
      gpuModel: row.gpu_model || '',
      vramMb: row.vram_mb !== null && row.vram_mb !== undefined ? String(row.vram_mb) : ''
    }))
  };
}

async function getScanToolOnlyFormDataByUnitId(unitId) {
  const blankData = {
    scanToolReadOnlyDetails: {
      cellularModules: []
    }
  };

  if (!await tableExists('unit_cellular_modules')) {
    return blankData;
  }

  const [rows] = await pool.query(
    `
      SELECT
        ucm.unit_cellular_module_id,
        wwan_status.label AS wwan_status_label,
        ucm.module_manufacturer,
        ucm.module_model,
        ucm.imei,
        ucm.firmware_version,
        ucm.supported_networks_text,
        ucm.supported_carriers_text,
        ucm.notes,
        ucm.source_code,
        ucm.installed_at
      FROM unit_cellular_modules ucm
      LEFT JOIN config_values wwan_status
        ON wwan_status.config_value_id = ucm.wwan_status_config_value_id
      WHERE ucm.unit_id = ?
        AND ucm.is_current = 1
      ORDER BY ucm.unit_cellular_module_id
    `,
    [unitId]
  );

  if (rows.length === 0) {
    return blankData;
  }

  const moduleIds = rows.map((row) => Number(row.unit_cellular_module_id));
  const modulesById = new Map();

  const cellularModules = rows.map((row) => {
    const cellularModule = {
      unitCellularModuleId: Number(row.unit_cellular_module_id),
      wwanStatusLabel: row.wwan_status_label || '',
      moduleLabel: [row.module_manufacturer, row.module_model].filter(Boolean).join(' '),
      moduleManufacturer: row.module_manufacturer || '',
      moduleModel: row.module_model || '',
      imei: row.imei || '',
      firmwareVersion: row.firmware_version || '',
      supportedNetworksText: row.supported_networks_text || '',
      supportedCarriersText: row.supported_carriers_text || '',
      notes: row.notes || '',
      bands: [],
      bandSummary: '',
      sourceCode: row.source_code || 'scantool',
      installedAt: row.installed_at
    };

    modulesById.set(cellularModule.unitCellularModuleId, cellularModule);

    return cellularModule;
  });

  if (await tableExists('unit_cellular_module_bands') && moduleIds.length > 0) {
    const placeholders = moduleIds.map(() => '?').join(', ');
    const [bandRows] = await pool.query(
      `
        SELECT
          ucmb.unit_cellular_module_id,
          network_type.label AS network_type_label,
          ucmb.band_code,
          ucmb.frequency_label,
          ucmb.region_note,
          ucmb.source_code
        FROM unit_cellular_module_bands ucmb
        LEFT JOIN config_values network_type
          ON network_type.config_value_id = ucmb.network_type_config_value_id
        WHERE ucmb.unit_cellular_module_id IN (${placeholders})
        ORDER BY ucmb.unit_cellular_module_id, network_type.sort_order, ucmb.band_code
      `,
      moduleIds
    );

    bandRows.forEach((bandRow) => {
      const cellularModule = modulesById.get(Number(bandRow.unit_cellular_module_id));

      if (!cellularModule) {
        return;
      }

      cellularModule.bands.push({
        networkTypeLabel: bandRow.network_type_label || '',
        bandCode: bandRow.band_code || '',
        frequencyLabel: bandRow.frequency_label || '',
        regionNote: bandRow.region_note || '',
        sourceCode: bandRow.source_code || 'scantool'
      });
    });

    modulesById.forEach((cellularModule) => {
      cellularModule.bandSummary = cellularModule.bands
        .map((band) => [band.networkTypeLabel, band.bandCode, band.frequencyLabel].filter(Boolean).join(' '))
        .filter(Boolean)
        .join(', ');
    });
  }

  return {
    scanToolReadOnlyDetails: {
      cellularModules
    }
  };
}

async function getExpandedFormDataByUnitId(unitId) {
  const safeUnitId = Number(unitId);

  if (!Number.isInteger(safeUnitId) || safeUnitId <= 0) {
    return getBlankExpandedFormData();
  }

  const [specificationData, gradeData, outcomeData, graphicsData, scanToolOnlyData] = await Promise.all([
    getUnitSpecificationFormData(safeUnitId),
    getCurrentGradeFormData(safeUnitId),
    getCurrentOutcomeFormData(safeUnitId),
    getGraphicsFormData(safeUnitId),
    getScanToolOnlyFormDataByUnitId(safeUnitId)
  ]);

  return {
    ...getBlankExpandedFormData(),
    ...specificationData,
    ...gradeData,
    ...outcomeData,
    ...graphicsData,
    ...scanToolOnlyData
  };
}

function getNormalizedGraphicsAdapters(formData) {
  return normalizeRows(formData.graphicsAdapters)
    .filter(graphicsRowHasAnyValue)
    .map((row) => ({
      gpuTypeConfigValueId: normalizeOptionalInteger(row.gpuTypeConfigValueId),
      gpuModel: normalizeNullableText(row.gpuModel, 150),
      vramMb: normalizeOptionalNonNegativeInteger(row.vramMb)
    }))
    .filter((row) => row.gpuTypeConfigValueId || row.gpuModel || row.vramMb !== null);
}

async function saveUnitSpecifications(connection, unitId, formData, currentUserId) {
  if (!await tableExists('unit_specifications', connection)) {
    return;
  }

  const values = [
    unitId,
    normalizeNullableText(formData.biosVersion, 100),
    normalizeNullableText(formData.osBuild, 100),
    normalizeOptionalInteger(formData.absoluteStatusConfigValueId),
    normalizeOptionalInteger(formData.physicalCameraStatusConfigValueId),
    normalizeOptionalInteger(formData.touchscreenStatusConfigValueId),
    normalizeOptionalInteger(formData.keyboardLanguageConfigValueId),
    normalizeOptionalInteger(formData.completeDiagnosticsStatusConfigValueId),
    normalizeOptionalInteger(formData.virusCheckStatusConfigValueId),
    normalizeOptionalInteger(formData.driverCheckStatusConfigValueId),
    normalizeOptionalInteger(formData.skinnedStatusConfigValueId),
    normalizeOptionalInteger(currentUserId),
    normalizeOptionalInteger(currentUserId)
  ];

  await connection.query(
    `
      INSERT INTO unit_specifications (
        unit_id,
        bios_version,
        os_build,
        absolute_status_config_value_id,
        physical_camera_status_config_value_id,
        touchscreen_status_config_value_id,
        keyboard_language_config_value_id,
        complete_diagnostics_status_config_value_id,
        virus_check_status_config_value_id,
        driver_check_status_config_value_id,
        skinned_status_config_value_id,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        bios_version = VALUES(bios_version),
        os_build = VALUES(os_build),
        absolute_status_config_value_id = VALUES(absolute_status_config_value_id),
        physical_camera_status_config_value_id = VALUES(physical_camera_status_config_value_id),
        touchscreen_status_config_value_id = VALUES(touchscreen_status_config_value_id),
        keyboard_language_config_value_id = VALUES(keyboard_language_config_value_id),
        complete_diagnostics_status_config_value_id = VALUES(complete_diagnostics_status_config_value_id),
        virus_check_status_config_value_id = VALUES(virus_check_status_config_value_id),
        driver_check_status_config_value_id = VALUES(driver_check_status_config_value_id),
        skinned_status_config_value_id = VALUES(skinned_status_config_value_id),
        updated_by_user_id = VALUES(updated_by_user_id)
    `,
    values
  );

  await upsertManualFieldSources(connection, unitId, [
    'bios_version',
    'os_build',
    'absolute_status',
    'physical_camera_status',
    'touchscreen_status',
    'keyboard_language',
    'complete_diagnostics_status',
    'virus_check_status',
    'driver_check_status',
    'skinned_status'
  ], currentUserId);
}

async function saveOverallGrade(connection, unitId, formData, currentUserId) {
  if (!await tableExists('unit_grade_assessments', connection)) {
    return;
  }

  const nextGradeId = normalizeOptionalInteger(formData.overallGradeConfigValueId);

  if (!nextGradeId) {
    return;
  }

  const nextNotes = normalizeNullableText(formData.overallGradeNotes, 500);

  const [currentRows] = await connection.query(
    `
      SELECT unit_grade_assessment_id, overall_grade_config_value_id, notes
      FROM unit_grade_assessments
      WHERE unit_id = ?
        AND is_current = 1
      ORDER BY assessed_at DESC, unit_grade_assessment_id DESC
      LIMIT 1
    `,
    [unitId]
  );

  const currentRow = currentRows[0] || null;

  if (
    currentRow &&
    Number(currentRow.overall_grade_config_value_id) === Number(nextGradeId) &&
    String(currentRow.notes || '') === String(nextNotes || '')
  ) {
    await upsertManualFieldSources(connection, unitId, ['overall_grade'], currentUserId);
    return;
  }

  await connection.query(
    `
      UPDATE unit_grade_assessments
      SET is_current = 0
      WHERE unit_id = ?
        AND is_current = 1
    `,
    [unitId]
  );

  await connection.query(
    `
      INSERT INTO unit_grade_assessments (
        unit_id,
        overall_grade_config_value_id,
        is_current,
        assessed_by_user_id,
        source_code,
        notes
      )
      VALUES (?, ?, 1, ?, 'tech_edit', ?)
    `,
    [unitId, nextGradeId, normalizeOptionalInteger(currentUserId), nextNotes]
  );

  await upsertManualFieldSources(connection, unitId, ['overall_grade'], currentUserId);
}

async function saveOutcome(connection, unitId, formData, currentUserId) {
  if (!await unitOutcomeModel.tableExists(connection)) {
    return;
  }

  await unitOutcomeModel.saveOutcomeForUnitWithConnection(connection, {
    unitId,
    formData,
    currentUserId
  });
}

async function saveGraphicsAdapters(connection, unitId, formData, currentUserId) {
  if (!await tableExists('unit_graphics_adapters', connection)) {
    return;
  }

  const graphicsAdapters = getNormalizedGraphicsAdapters(formData);

  await connection.query(
    `
      UPDATE unit_graphics_adapters
      SET
        is_current = 0,
        updated_by_user_id = ?
      WHERE unit_id = ?
        AND is_current = 1
    `,
    [normalizeOptionalInteger(currentUserId), unitId]
  );

  for (const graphicsAdapter of graphicsAdapters) {
    await connection.query(
      `
        INSERT INTO unit_graphics_adapters (
          unit_id,
          gpu_type_config_value_id,
          gpu_model,
          vram_mb,
          is_current,
          source_code,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?, 1, 'tech_edit', ?, ?)
      `,
      [
        unitId,
        graphicsAdapter.gpuTypeConfigValueId,
        graphicsAdapter.gpuModel,
        graphicsAdapter.vramMb,
        normalizeOptionalInteger(currentUserId),
        normalizeOptionalInteger(currentUserId)
      ]
    );
  }

  await upsertManualFieldSources(connection, unitId, ['graphics_adapters'], currentUserId);
}

async function saveExpandedDetailsForUnit({ unitId, formData, currentUserId }) {
  const safeUnitId = Number(unitId);

  if (!Number.isInteger(safeUnitId) || safeUnitId <= 0) {
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await saveUnitSpecifications(connection, safeUnitId, formData, currentUserId);
    await saveOverallGrade(connection, safeUnitId, formData, currentUserId);
    await saveOutcome(connection, safeUnitId, formData, currentUserId);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getBlankExpandedFormData,
  getExpandedFormOptions,
  getExpandedFormDataByUnitId,
  saveExpandedDetailsForUnit
};
