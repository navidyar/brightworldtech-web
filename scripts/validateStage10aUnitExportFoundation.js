'use strict';

const { pool } = require('../models/db');
const { buildFilteredUnitExportDataset } = require('../services/unitExportService');
const { UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');

async function validateSchema() {
  const [rows] = await pool.query(
    `
      SELECT CONCAT(
        (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'
           AND COLUMN_NAME = 'battery_health_percent'
           AND COLUMN_TYPE = 'decimal(5,1) unsigned'),
        ':',
        (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processor_families'
           AND COLUMN_NAME = 'export_short_form'
           AND CHARACTER_MAXIMUM_LENGTH = 40
           AND IS_NULLABLE = 'NO'),
        ':',
        (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'units'
           AND CONSTRAINT_NAME = 'chk_units_battery_health_percent'
           AND CONSTRAINT_TYPE = 'CHECK'),
        ':',
        (SELECT COUNT(*) FROM units
         WHERE battery_health_percent IS NOT NULL
           AND battery_health_percent NOT BETWEEN 0 AND 100),
        ':',
        (SELECT COUNT(*) FROM processor_families
         WHERE TRIM(COALESCE(export_short_form, '')) = '')
      ) AS readiness_signature
    `
  );

  const signature = String(rows[0] && rows[0].readiness_signature || '');
  if (signature !== '1:1:1:0:0') {
    throw new Error(`Stage 10A database readiness is ${signature}; expected 1:1:1:0:0.`);
  }
}

async function main() {
  try {
    await validateSchema();
    const dataset = await buildFilteredUnitExportDataset({
      unitState: 'active',
      page: '1',
      perPage: 'all',
      canViewParkedUnits: true,
      allowAnyLotFilter: true,
      restrictToCurrentAssignment: false
    });

    const requiredKeys = ['assetTag', 'cpu', 'shortForm', 'batteryHealth', 'cosmeticGrade', 'passFail'];
    const datasetKeys = dataset.columns.map((column) => column.key);
    const contractKeys = UNIT_EXPORT_COLUMNS.map((column) => column.key);
    const missingKeys = requiredKeys.filter((key) => !contractKeys.includes(key));
    if (missingKeys.length > 0 || JSON.stringify(datasetKeys) !== JSON.stringify(contractKeys)) {
      throw new Error(
        `Stage 10A export contract is out of sync${missingKeys.length ? `; missing ${missingKeys.join(', ')}` : ''}.`
      );
    }
    if (dataset.totalRows !== dataset.browserTotalRows) {
      throw new Error(`Stage 10A export count mismatch: ${dataset.totalRows} rows vs ${dataset.browserTotalRows} browser rows.`);
    }

    console.log(`Stage 10A filtered Unit export foundation valid: ${dataset.totalRows} active Unit(s), ${dataset.columns.length} export columns.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
