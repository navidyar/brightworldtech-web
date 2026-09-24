const { pool } = require('./db');
const unitFieldSourceModel = require('./unitFieldSourceModel');
const { listConfigValuesBySystemCategoryIds, getConfigValueBySystemId } = require('./configLookupModel');
const { SYSTEM_CONFIG_CATEGORY_IDS, COSMETIC_GRADE_BY_SYSTEM_VALUE_ID } = require('../config/configIdentityRegistry');
const unitOutcomeModel = require('./unitOutcomeModel');
const overrideRequestModel = require('./overrideRequestModel');
const operationalOptionRankingModel = require('./operationalOptionRankingModel');
const unitSpecsTestsModel = require('./unitSpecsTestsModel');
const { sortOptionsByPopularity } = require('../services/operationalOptionRanking');
const {
  getCanonicalCosmeticGradeFromOption,
  normalizeCosmeticGradeOptions
} = require('../services/cosmeticGradeNormalization');
const {
  isAnyUnitFormFieldManaged,
  isUnitFormFieldManaged
} = require('../services/unitFormSubmissionPolicy');

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
  if (String(sourceCode || 'tech_edit').trim().toLowerCase() !== 'tech_edit') {
    throw new Error('unitExpandedFormModel only records ordinary Tech form edits.');
  }
  await unitFieldSourceModel.recordTechEditSource(connection, {
    unitId,
    fieldKey,
    sourceNote,
    userId: currentUserId
  });
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

async function listConfigValuesBySystemCategories(systemCategoryIds, connection = pool) {
  return listConfigValuesBySystemCategoryIds(systemCategoryIds, {}, connection);
}

async function buildSkinningAttributionPlan(connection, unitId, selectedConfigValueId, currentUserId) {
  const selectedId = normalizeOptionalInteger(selectedConfigValueId);
  const options = await listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.SKINNED_STATUSES, connection);
  const selected = options.find((option) => Number(option.id) === selectedId) || null;
  const isSkinnedByBwt = String(selected?.label || '').trim().toLowerCase() === 'skinned by bwt';

  if (!isSkinnedByBwt) {
    return { action: 'clear' };
  }

  const userId = normalizeOptionalInteger(currentUserId);
  if (!userId) {
    throw new Error('Skinned by BWT requires an authenticated BWTDallas user.');
  }

  const [rows] = await connection.query(
    `SELECT skinned_status_config_value_id, skinned_by_user_id, skinned_at
       FROM unit_specifications
      WHERE unit_id = ?
      LIMIT 1`,
    [unitId]
  );
  const current = rows[0] || null;
  if (
    Number(current?.skinned_status_config_value_id || 0) === selectedId
    && Number(current?.skinned_by_user_id || 0) > 0
    && current?.skinned_at
  ) {
    return { action: 'preserve' };
  }

  return { action: 'stamp', userId };
}

async function applySkinningAttributionPlan(connection, unitId, plan) {
  if (!plan || plan.action === 'preserve') return;
  if (plan.action === 'stamp') {
    await connection.query(
      `UPDATE unit_specifications
          SET skinned_by_user_id = ?, skinned_at = CURRENT_TIMESTAMP
        WHERE unit_id = ?`,
      [plan.userId, unitId]
    );
    return;
  }
  await connection.query(
    `UPDATE unit_specifications
        SET skinned_by_user_id = NULL, skinned_at = NULL
      WHERE unit_id = ?`,
    [unitId]
  );
}

function getBlankExpandedFormData() {
  return {
    ...unitSpecsTestsModel.getBlankSpecsTestsData(),
    overallGradeConfigValueId: '',
    overallGradeNotes: '',
    outcomeCode: '',
    outcomeNotes: '',
    outcomeApprovalRequested: false,
    outcomeApprovalRequestNotes: '',
    biosVersion: '',
    osBuild: '',
    absoluteStatusConfigValueId: '',
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
    touchscreenStatusOptions,
    keyboardLanguageOptions,
    diagnosticsStatusOptions,
    virusCheckStatusOptions,
    driverCheckStatusOptions,
    skinnedStatusOptions,
    gpuTypeOptions,
    operationalRankingSnapshot
  ] = await Promise.all([
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.DRIVER_CHECK_STATUSES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.SKINNED_STATUSES),
    listConfigValuesBySystemCategories(SYSTEM_CONFIG_CATEGORY_IDS.GPU_TYPES),
    operationalOptionRankingModel.loadRankingSnapshot()
  ]);

  const specsTestsOptions = await unitSpecsTestsModel.getSpecsTestsOptions();

  return {
    ...specsTestsOptions,
    expandedOptionsSupported: await tableExists('unit_specifications'),
    gradeOptionsSupported: await tableExists('unit_grade_assessments'),
    outcomeOptionsSupported: await unitOutcomeModel.tableExists(),
    outcomeOptions: [
      { code: 'pass', label: 'Pass' },
      { code: 'fail', label: 'Fail' }
    ],
    graphicsOptionsSupported: await tableExists('unit_graphics_adapters'),
    overallGradeOptions: normalizeCosmeticGradeOptions(rawOverallGradeOptions),
    absoluteStatusOptions,
    touchscreenStatusOptions,
    keyboardLanguageOptions: sortOptionsByPopularity(keyboardLanguageOptions, operationalRankingSnapshot, {
      optionScope: 'keyboard_language'
    }),
    diagnosticsStatusOptions,
    virusCheckStatusOptions,
    driverCheckStatusOptions,
    skinnedStatusOptions,
    gpuTypeOptions: sortOptionsByPopularity(gpuTypeOptions, operationalRankingSnapshot, {
      optionScope: 'gpu_type'
    })
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

  const [specificationData, specsTestsData, gradeData, outcomeData, graphicsData, scanToolOnlyData] = await Promise.all([
    getUnitSpecificationFormData(safeUnitId),
    unitSpecsTestsModel.getSpecsTestsDataByUnitId(safeUnitId),
    getCurrentGradeFormData(safeUnitId),
    getCurrentOutcomeFormData(safeUnitId),
    getGraphicsFormData(safeUnitId),
    getScanToolOnlyFormDataByUnitId(safeUnitId)
  ]);

  return {
    ...getBlankExpandedFormData(),
    ...specificationData,
    ...specsTestsData,
    ...gradeData,
    ...outcomeData,
    ...graphicsData,
    ...scanToolOnlyData
  };
}

async function saveUnitSpecifications(connection, unitId, formData, currentUserId) {
  if (!await tableExists('unit_specifications', connection)) {
    return;
  }

  const specificationFields = [
    {
      fieldKey: 'bios_version',
      sourceKey: 'bios_version',
      columnName: 'bios_version',
      value: normalizeNullableText(formData.biosVersion, 100)
    },
    {
      fieldKey: 'os_build',
      sourceKey: 'os_build',
      columnName: 'os_build',
      value: normalizeNullableText(formData.osBuild, 100)
    },
    {
      fieldKey: 'absolute_status',
      sourceKey: 'absolute_status',
      columnName: 'absolute_status_config_value_id',
      value: normalizeOptionalInteger(formData.absoluteStatusConfigValueId)
    },
    {
      fieldKey: 'touchscreen_status',
      sourceKey: 'touchscreen_status',
      columnName: 'touchscreen_status_config_value_id',
      value: normalizeOptionalInteger(formData.touchscreenStatusConfigValueId)
    },
    {
      fieldKey: 'keyboard_language',
      sourceKey: 'keyboard_language',
      columnName: 'keyboard_language_config_value_id',
      value: normalizeOptionalInteger(formData.keyboardLanguageConfigValueId)
    },
    {
      fieldKey: 'complete_diagnostics',
      sourceKey: 'complete_diagnostics',
      columnName: 'complete_diagnostics_status_config_value_id',
      value: normalizeOptionalInteger(formData.completeDiagnosticsStatusConfigValueId)
    },
    {
      fieldKey: 'virus_check',
      sourceKey: 'virus_check',
      columnName: 'virus_check_status_config_value_id',
      value: normalizeOptionalInteger(formData.virusCheckStatusConfigValueId)
    },
    {
      fieldKey: 'driver_check',
      sourceKey: 'driver_check',
      columnName: 'driver_check_status_config_value_id',
      value: normalizeOptionalInteger(formData.driverCheckStatusConfigValueId)
    },
    {
      fieldKey: 'skinned_status',
      sourceKey: 'skinned_status',
      columnName: 'skinned_status_config_value_id',
      value: normalizeOptionalInteger(formData.skinnedStatusConfigValueId)
    }
  ];
  const managedFields = specificationFields.filter((field) => (
    isUnitFormFieldManaged(formData, field.fieldKey)
  ));

  if (managedFields.length === 0) {
    return;
  }

  const skinningAttributionPlan = isUnitFormFieldManaged(formData, 'skinned_status')
    ? await buildSkinningAttributionPlan(
      connection,
      unitId,
      formData.skinnedStatusConfigValueId,
      currentUserId
    )
    : null;

  const insertColumns = [
    'unit_id',
    ...managedFields.map((field) => field.columnName),
    'created_by_user_id',
    'updated_by_user_id'
  ];
  const values = [
    unitId,
    ...managedFields.map((field) => field.value),
    normalizeOptionalInteger(currentUserId),
    normalizeOptionalInteger(currentUserId)
  ];
  const updateAssignments = [
    ...managedFields.map((field) => `${field.columnName} = VALUES(${field.columnName})`),
    'updated_by_user_id = VALUES(updated_by_user_id)'
  ];

  await connection.query(
    `
      INSERT INTO unit_specifications (${insertColumns.join(', ')})
      VALUES (${insertColumns.map(() => '?').join(', ')})
      ON DUPLICATE KEY UPDATE
        ${updateAssignments.join(',\n        ')}
    `,
    values
  );

  await applySkinningAttributionPlan(connection, unitId, skinningAttributionPlan);

  await upsertManualFieldSources(
    connection,
    unitId,
    managedFields.map((field) => field.sourceKey),
    currentUserId
  );
}

async function resolveCanonicalCosmeticGradeConfigValueId(connection, selectedConfigValueId) {
  const selectedId = normalizeOptionalInteger(selectedConfigValueId);

  if (!selectedId) {
    return null;
  }

  const [selectedRows] = await connection.query(
    `SELECT cv.config_value_id, cv.is_active, scv.system_config_value_id, scc.system_config_category_id, cv.label, cv.value
     FROM config_values cv
     LEFT JOIN system_config_values scv ON scv.config_value_id = cv.config_value_id
     LEFT JOIN system_config_categories scc ON scc.config_category_id = cv.config_category_id
     WHERE cv.config_value_id = ?
     LIMIT 1`,
    [selectedId]
  );
  const selectedRow = selectedRows[0] || null;
  const selectedSystemId = Number(selectedRow?.system_config_value_id || 0);
  const canonicalGrade = COSMETIC_GRADE_BY_SYSTEM_VALUE_ID[selectedSystemId]
    || getCanonicalCosmeticGradeFromOption(selectedRow || {});
  const belongsToCosmeticGradeCategory = Number(selectedRow?.system_config_category_id || 0) === SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES;

  if (!canonicalGrade) {
    return belongsToCosmeticGradeCategory && Number(selectedRow?.is_active || 0) === 1 ? selectedId : null;
  }

  const systemId = Object.entries(COSMETIC_GRADE_BY_SYSTEM_VALUE_ID)
    .find(([, grade]) => grade === canonicalGrade)?.[0];
  if (!systemId) return selectedId;
  const canonicalValue = await getConfigValueBySystemId(Number(systemId), connection);
  return canonicalValue?.isActive ? canonicalValue.configValueId : selectedId;
}

async function saveOverallGrade(connection, unitId, formData, currentUserId) {
  if (!isAnyUnitFormFieldManaged(formData, ['overall_grade', 'overall_grade_notes'])) {
    return;
  }

  if (!await tableExists('unit_grade_assessments', connection)) {
    return;
  }

  const nextGradeId = await resolveCanonicalCosmeticGradeConfigValueId(
    connection,
    formData.overallGradeConfigValueId
  );

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

async function saveOutcome(connection, unitId, formData, currentUserId, { canRequestOutcomeConfirmation = false } = {}) {
  if (!isAnyUnitFormFieldManaged(formData, ['unit_outcome', 'outcome_notes'])) {
    return;
  }

  if (!await unitOutcomeModel.tableExists(connection)) {
    return;
  }

  const outcomeSaveResult = await unitOutcomeModel.saveOutcomeForUnitWithConnection(connection, {
    unitId,
    formData,
    currentUserId,
    canRequestOutcomeConfirmation
  });

  const outcomeCode = unitOutcomeModel.normalizeOutcomeCode(formData.outcomeCode);
  const approvalRequested = canRequestOutcomeConfirmation
    && unitOutcomeModel.normalizeApprovalRequested(formData.outcomeApprovalRequested);

  if (!outcomeCode || (!approvalRequested && !outcomeSaveResult?.outcomeChanged)) {
    return;
  }

  const [unitRows] = await connection.query(
    `
      SELECT lot_id
      FROM units
      WHERE unit_id = ?
      LIMIT 1
    `,
    [unitId]
  );

  await overrideRequestModel.syncOutcomeConfirmationRequestWithConnection(connection, {
    unitId,
    lotId: unitRows[0] ? unitRows[0].lot_id : null,
    requestedByUserId: currentUserId,
    outcomeCode,
    outcomeNotes: formData.outcomeNotes,
    requestNotes: formData.outcomeApprovalRequestNotes,
    unitOutcomeId: outcomeSaveResult?.unitOutcomeId || null,
    approvalRequested
  });
}

async function saveExpandedDetailsForUnitWithConnection(connection, { unitId, formData, currentUserId, canRequestOutcomeConfirmation = false }) {
  const safeUnitId = Number(unitId);

  if (!connection || !Number.isInteger(safeUnitId) || safeUnitId <= 0) {
    return;
  }

  await saveUnitSpecifications(connection, safeUnitId, formData, currentUserId);
  await unitSpecsTestsModel.saveSpecsTestsForUnitWithConnection(connection, { unitId: safeUnitId, formData, currentUserId });
  await saveOverallGrade(connection, safeUnitId, formData, currentUserId);
  await saveOutcome(connection, safeUnitId, formData, currentUserId, { canRequestOutcomeConfirmation });
}
module.exports = {
  getBlankExpandedFormData,
  getExpandedFormOptions,
  getExpandedFormDataByUnitId,
  saveExpandedDetailsForUnitWithConnection
};
