'use strict';

const { pool } = require('./db');
const { getLotRequirementField } = require('../config/lotRequirementRegistry');
const { normalizeCosmeticGradeRequirementOptions } = require('../services/cosmeticGradeNormalization');

const CONFIG_CATEGORY_CODES_BY_SOURCE = Object.freeze({
  unit_type: ['unit_categories', 'unit_category'],
  ram_type: ['ram_types', 'ram_type'],
  storage_type: ['storage_types', 'storage_type', 'ssd_types', 'ssd_type'],
  storage_wipe_status: ['storage_wipe_statuses', 'storage_wipe_status', 'wipe_statuses', 'wipe_status'],
  operating_system: ['operating_systems', 'operating_system'],
  absolute_status: ['absolute_statuses', 'absolute_status'],
  physical_camera_status: ['physical_camera_statuses', 'camera_statuses', 'physical_camera_status'],
  touchscreen_status: ['touchscreen_statuses', 'touchscreen_status'],
  keyboard_language: ['keyboard_languages', 'keyboard_language'],
  complete_diagnostics: ['diagnostics_statuses', 'complete_diagnostics_statuses', 'diagnostics_status'],
  virus_check: ['virus_check_statuses', 'virus_check_status'],
  driver_check: ['driver_check_statuses', 'driver_check_status'],
  skinned_status: ['skinned_statuses', 'skinned_status'],
  overall_grade: ['cosmetic_grades', 'overall_unit_grades', 'unit_grades', 'unit_grade']
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

async function listConfigValueOptions(categoryCodes) {
  const placeholders = categoryCodes.map(() => '?').join(', ');
  const orderPlaceholders = categoryCodes.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id,
        cv.code,
        cv.label,
        cc.code AS category_code
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code IN (${placeholders})
        AND cv.is_active = 1
      ORDER BY
        FIELD(cc.code, ${orderPlaceholders}),
        cv.sort_order,
        cv.label,
        cv.code
    `,
    [...categoryCodes, ...categoryCodes]
  );

  return rows.map((row) => ({
    value: `config_value:${row.config_value_id}`,
    label: row.label || row.code,
    code: row.code,
    source: row.category_code
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

  if (CONFIG_CATEGORY_CODES_BY_SOURCE[optionSource]) {
    const options = await listConfigValueOptions(CONFIG_CATEGORY_CODES_BY_SOURCE[optionSource]);

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
