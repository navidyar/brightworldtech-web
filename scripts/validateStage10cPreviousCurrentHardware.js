'use strict';

const { pool } = require('../models/db');
const { UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');
const { buildFilteredUnitExportDataset } = require('../services/unitExportService');

function parseSizeGb(value) {
  const match = String(value || '').match(/^([0-9]+(?:\.[0-9]+)?)\s+GB$/i);
  return match ? Number(match[1]) : 0;
}

async function validateSchema() {
  const [rows] = await pool.query(`
    SELECT CONCAT(
      (SELECT COUNT(*)
       FROM information_schema.COLUMNS previous_column
       JOIN information_schema.COLUMNS current_column
         ON current_column.TABLE_SCHEMA = previous_column.TABLE_SCHEMA
        AND current_column.TABLE_NAME = previous_column.TABLE_NAME
       WHERE previous_column.TABLE_SCHEMA = DATABASE()
         AND previous_column.TABLE_NAME = 'units'
         AND previous_column.COLUMN_NAME = 'previous_ram_gb'
         AND current_column.COLUMN_NAME = 'ram_gb'
         AND previous_column.COLUMN_TYPE = current_column.COLUMN_TYPE
         AND previous_column.IS_NULLABLE = 'YES'),
      ':',
      (SELECT COUNT(*)
       FROM information_schema.COLUMNS previous_column
       JOIN information_schema.COLUMNS current_column
         ON current_column.TABLE_SCHEMA = previous_column.TABLE_SCHEMA
        AND current_column.TABLE_NAME = previous_column.TABLE_NAME
       WHERE previous_column.TABLE_SCHEMA = DATABASE()
         AND previous_column.TABLE_NAME = 'units'
         AND previous_column.COLUMN_NAME = 'previous_storage_gb'
         AND current_column.COLUMN_NAME = 'storage_gb'
         AND previous_column.COLUMN_TYPE = current_column.COLUMN_TYPE
         AND previous_column.IS_NULLABLE = 'YES'),
      ':',
      (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()
         AND TABLE_NAME = 'units'
         AND CONSTRAINT_NAME IN ('chk_units_previous_ram_gb', 'chk_units_previous_storage_gb')
         AND CONSTRAINT_TYPE = 'CHECK'),
      ':',
      (SELECT COUNT(*) FROM units
       WHERE (previous_ram_gb IS NOT NULL AND previous_ram_gb < 0)
          OR (previous_storage_gb IS NOT NULL AND previous_storage_gb < 0))
    ) AS readiness_signature
  `);

  const signature = String(rows[0] && rows[0].readiness_signature || '');
  if (signature !== '1:1:2:0') {
    throw new Error(`Stage 10C database readiness is ${signature}; expected 1:1:2:0.`);
  }
}

function validateDatasetTotals(dataset) {
  const totals = dataset.capacityTotals || {};
  const rowTotals = dataset.rows.reduce((summary, row) => {
    const values = {
      previousMemoryGb: parseSizeGb(row.previousMemorySize),
      currentMemoryGb: parseSizeGb(row.currentMemorySize),
      previousStorageGb: parseSizeGb(row.previousStorageSize),
      currentStorageGb: parseSizeGb(row.currentStorageSize)
    };

    for (const [key, value] of Object.entries(values)) {
      summary[key] += value;
      if (value > 0) summary[`${key.replace(/Gb$/, '')}RecordedUnits`] += 1;
    }
    return summary;
  }, {
    previousMemoryGb: 0,
    currentMemoryGb: 0,
    previousStorageGb: 0,
    currentStorageGb: 0,
    previousMemoryRecordedUnits: 0,
    currentMemoryRecordedUnits: 0,
    previousStorageRecordedUnits: 0,
    currentStorageRecordedUnits: 0
  });

  for (const [key, expected] of Object.entries(rowTotals)) {
    if (Number(totals[key] || 0) !== expected) {
      throw new Error(`Stage 10C ${key} is ${totals[key]}; expected ${expected}.`);
    }
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

    const requiredKeys = [
      'previousMemorySize', 'currentMemorySize', 'previousStorageSize', 'currentStorageSize',
      'previousMemoryModules', 'currentMemoryModules', 'previousStorageDevices', 'currentStorageDevices'
    ];
    const datasetKeys = dataset.columns.map((column) => column.key);
    const contractKeys = UNIT_EXPORT_COLUMNS.map((column) => column.key);
    const missingKeys = requiredKeys.filter((key) => !contractKeys.includes(key));
    if (missingKeys.length > 0 || JSON.stringify(datasetKeys) !== JSON.stringify(contractKeys)) {
      throw new Error(
        `Stage 10C export contract is out of sync${missingKeys.length ? `; missing ${missingKeys.join(', ')}` : ''}.`
      );
    }
    validateDatasetTotals(dataset);

    console.log(
      `Stage 10C previous/current hardware valid: ${dataset.totalRows} active Unit(s), `
      + `${dataset.capacityTotals.previousMemoryRecordedUnits} previous-memory record(s), `
      + `${dataset.capacityTotals.previousStorageRecordedUnits} previous-storage record(s).`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
