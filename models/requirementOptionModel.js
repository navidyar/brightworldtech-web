'use strict';

const { pool } = require('./db');
const { listConfigValuesBySystemCategoryIds } = require('./configLookupModel');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const { getLotRequirementField } = require('../config/lotRequirementRegistry');
const { normalizeCosmeticGradeRequirementOptions } = require('../services/cosmeticGradeNormalization');

const CONFIG_CATEGORY_IDS_BY_SOURCE = Object.freeze({
  unit_type: SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES,
  ram_type: SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES,
  storage_type: SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES,
  storage_wipe_status: SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_WIPE_STATUSES,
  operating_system: SYSTEM_CONFIG_CATEGORY_IDS.OPERATING_SYSTEMS,
  screen_size: SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_SIZES,
  yes_no: SYSTEM_CONFIG_CATEGORY_IDS.YES_NO_OPTIONS,
  test_result: SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS,
  lock_status: SYSTEM_CONFIG_CATEGORY_IDS.LOCK_STATUSES,
  display_type: SYSTEM_CONFIG_CATEGORY_IDS.DISPLAY_TYPES,
  native_screen_resolution: SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_RESOLUTIONS,
  refresh_rate: SYSTEM_CONFIG_CATEGORY_IDS.REFRESH_RATES,
  color: SYSTEM_CONFIG_CATEGORY_IDS.COLORS,
  box_language: SYSTEM_CONFIG_CATEGORY_IDS.BOX_LANGUAGES,
  absolute_status: SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES,
  touchscreen_status: SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES,
  keyboard_language: SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES,
  complete_diagnostics: SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES,
  virus_check: SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES,
  driver_check: SYSTEM_CONFIG_CATEGORY_IDS.DRIVER_CHECK_STATUSES,
  skinned_status: SYSTEM_CONFIG_CATEGORY_IDS.SKINNED_STATUSES,
  overall_grade: SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES
});

const STATIC_OPTIONS_BY_SOURCE = Object.freeze({
  memory_install_type: Object.freeze([
    Object.freeze({ value: 'removable_module', label: 'Removable', code: 'removable_module' }),
    Object.freeze({ value: 'integrated_soldered', label: 'Integrated / Soldered', code: 'integrated_soldered' }),
    Object.freeze({ value: 'unknown', label: 'Unknown', code: 'unknown' })
  ]),
  unit_outcome: Object.freeze([
    Object.freeze({ value: 'pass', label: 'Pass', code: 'pass' }),
    Object.freeze({ value: 'fail', label: 'Fail', code: 'fail' })
  ])
});

async function listConfigValueOptions(systemCategoryId) {
  const rows = await listConfigValuesBySystemCategoryIds(systemCategoryId);
  return rows.map((row) => ({
    value: `config_value:${row.configValueId}`,
    label: row.label,
    configValueId: row.configValueId,
    systemConfigValueId: row.systemConfigValueId,
    systemConfigCategoryId: row.systemConfigCategoryId,
    source: row.systemConfigCategoryId
  }));
}

async function listManufacturerOptions() {
  const [rows] = await pool.query(`
    SELECT manufacturer_id, code, name
    FROM manufacturers
    WHERE is_active = 1
    ORDER BY name, code
  `);

  return rows.map((row) => ({
    value: `manufacturer:${row.manufacturer_id}`,
    label: row.name || row.code,
    code: row.code,
    source: 'manufacturers'
  }));
}

async function listUnitModelOptions() {
  const [rows] = await pool.query(`
    SELECT
      um.unit_model_id,
      um.model_name,
      um.model_number,
      m.name AS manufacturer_name,
      category.label AS category_label
    FROM unit_models um
    JOIN manufacturers m
      ON m.manufacturer_id = um.manufacturer_id
    JOIN config_values category
      ON category.config_value_id = um.unit_category_config_value_id
    WHERE um.is_active = 1
    ORDER BY m.name, um.sort_order, um.model_name, um.model_number
  `);

  return rows.map((row) => {
    const detailParts = [row.manufacturer_name, row.category_label].filter(Boolean);
    const modelLabel = row.model_number
      ? `${row.model_name} (${row.model_number})`
      : row.model_name;

    return {
      value: `unit_model:${row.unit_model_id}`,
      label: detailParts.length > 0 ? `${detailParts.join(' · ')} · ${modelLabel}` : modelLabel,
      code: String(row.unit_model_id),
      source: 'unit_models'
    };
  });
}

async function listProcessorFamilyOptions() {
  const [rows] = await pool.query(`
    SELECT
      pf.processor_family_id,
      pf.name,
      pf.description,
      pb.name AS brand_name,
      COUNT(pfm.processor_model_id) AS member_count
    FROM processor_families pf
    INNER JOIN processor_brands pb
      ON pb.processor_brand_id = pf.processor_brand_id
    LEFT JOIN processor_family_members pfm
      ON pfm.processor_family_id = pf.processor_family_id
    WHERE pf.is_active = 1
      AND pb.is_active = 1
    GROUP BY
      pf.processor_family_id,
      pf.name,
      pf.description,
      pb.name,
      pf.sort_order
    HAVING COUNT(pfm.processor_model_id) > 0
    ORDER BY pb.name, pf.sort_order, pf.name
  `);

  return rows.map((row) => {
    const familyName = String(row.name || '').trim();
    const brandName = String(row.brand_name || '').trim();
    const includesBrand = familyName.toLowerCase().startsWith(brandName.toLowerCase());
    const displayName = brandName && !includesBrand ? `${brandName} · ${familyName}` : familyName;

    return {
      value: `processor_family:${row.processor_family_id}`,
      label: `${displayName} (${Number(row.member_count || 0)} processors)`,
      code: String(row.processor_family_id),
      description: row.description || '',
      source: 'processor_families'
    };
  });
}

async function listProcessorModelOptions() {
  const [rows] = await pool.query(`
    SELECT
      pm.processor_model_id,
      pm.processor_family,
      pm.model_code,
      pm.base_speed_ghz,
      pb.name AS brand_name
    FROM processor_models pm
    JOIN processor_brands pb
      ON pb.processor_brand_id = pm.processor_brand_id
    WHERE pm.is_active = 1
      AND pb.is_active = 1
    ORDER BY pb.name, pm.processor_family, pm.model_code, pm.base_speed_ghz
  `);

  return rows.map((row) => {
    const labelParts = [row.brand_name, row.processor_family, row.model_code].filter(Boolean);

    if (row.base_speed_ghz !== null && row.base_speed_ghz !== undefined) {
      labelParts.push(`${Number(row.base_speed_ghz).toFixed(2)} GHz`);
    }

    return {
      value: `processor_model:${row.processor_model_id}`,
      label: labelParts.join(' · '),
      code: row.model_code,
      source: 'processor_models'
    };
  });
}

async function listOptionsForSource(optionSource) {
  if (!optionSource) {
    return [];
  }

  if (CONFIG_CATEGORY_IDS_BY_SOURCE[optionSource]) {
    const options = await listConfigValueOptions(CONFIG_CATEGORY_IDS_BY_SOURCE[optionSource]);

    return optionSource === 'overall_grade'
      ? normalizeCosmeticGradeRequirementOptions(options)
      : options;
  }

  if (optionSource === 'manufacturer') {
    return listManufacturerOptions();
  }

  if (optionSource === 'model') {
    return listUnitModelOptions();
  }

  if (optionSource === 'processor') {
    return listProcessorModelOptions();
  }

  if (optionSource === 'processor_family') {
    return listProcessorFamilyOptions();
  }

  if (STATIC_OPTIONS_BY_SOURCE[optionSource]) {
    return STATIC_OPTIONS_BY_SOURCE[optionSource].map((option) => ({
      ...option,
      source: optionSource
    }));
  }

  return [];
}

async function getRequirementValueOptionsByKey(requirementKeys) {
  const optionMap = {};

  for (const requirementKey of requirementKeys) {
    const definition = getLotRequirementField(requirementKey);

    if (!definition) {
      optionMap[requirementKey] = {
        type: 'unsupported',
        source: null,
        options: [],
        allowedOperators: []
      };
      continue;
    }

    if (definition.storageKind === 'number') {
      optionMap[definition.key] = {
        type: 'number',
        source: 'numeric',
        options: [],
        helpText: definition.helpText || '',
        unitSuffix: definition.unitSuffix || '',
        numericInput: {
          minimum: definition.minimumValue ?? 0.01,
          maximum: definition.maximumValue ?? null,
          decimalPlaces: definition.decimalPlaces ?? 2,
          step: 1 / (10 ** (definition.decimalPlaces ?? 2)),
          exampleValue: definition.exampleValue || ''
        },
        allowedOperators: [...definition.allowedOperators]
      };
      continue;
    }

    if (definition.storageKind === 'text') {
      optionMap[definition.key] = {
        type: 'text',
        source: 'text',
        options: [],
        helpText: definition.helpText || '',
        maximumLength: definition.maximumLength || 120,
        allowedOperators: [...definition.allowedOperators]
      };
      continue;
    }

    const options = await listOptionsForSource(definition.optionSource);

    optionMap[definition.key] = {
      type: 'select',
      source: options[0]?.source || definition.optionSource,
      options,
      allowedOperators: [...definition.allowedOperators]
    };
  }

  return optionMap;
}

module.exports = {
  getRequirementValueOptionsByKey
};
