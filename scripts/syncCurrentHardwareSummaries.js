'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { summarizeCurrentMemoryRows, syncMemorySummary } = require('../services/apiMemoryInventory');
const { summarizeCurrentStorageRows, syncStorageSummary } = require('../services/apiStorageInventory');

const APPLY = process.argv.includes('--apply');

function groupRows(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const unitId = Number(row.unit_id);
    if (!Number.isSafeInteger(unitId) || unitId <= 0) continue;
    if (!grouped.has(unitId)) grouped.set(unitId, []);
    grouped.get(unitId).push(row);
  }
  return grouped;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function valuesEqual(left, right) {
  return nullableNumber(left) === nullableNumber(right);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const [[unitCountRow], memoryResult, storageResult, unitResult] = await Promise.all([
      connection.query('SELECT COUNT(*) AS row_count FROM units'),
      connection.query(`SELECT unit_id, unit_memory_module_id, slot_label, size_gb,
                               ram_type_config_value_id, memory_install_type_code, speed_mhz
                          FROM unit_memory_modules
                         WHERE is_current = 1
                         ORDER BY unit_id, unit_memory_module_id`),
      connection.query(`SELECT unit_id, unit_storage_device_id, slot_label, size_gb,
                               storage_type_config_value_id, wipe_status_config_value_id,
                               model_number, serial_number, firmware_version, raw_size_bytes,
                               storage_interface, media_type, health_status, storage_install_type_code
                          FROM unit_storage_devices
                         WHERE is_current = 1
                         ORDER BY unit_id, unit_storage_device_id`),
      connection.query(`SELECT unit_id, ram_gb, ram_type_config_value_id,
                               storage_gb, storage_type_config_value_id
                          FROM units
                         ORDER BY unit_id`)
    ]);

    const memoryByUnit = groupRows(memoryResult[0]);
    const storageByUnit = groupRows(storageResult[0]);
    const changes = [];

    for (const unit of unitResult[0]) {
      const unitId = Number(unit.unit_id);
      const memoryRows = memoryByUnit.get(unitId) || [];
      const storageRows = storageByUnit.get(unitId) || [];
      const memorySummary = memoryRows.length ? summarizeCurrentMemoryRows(memoryRows) : null;
      const storageSummary = storageRows.length ? summarizeCurrentStorageRows(storageRows) : null;
      const memoryMismatch = Boolean(memorySummary) && (
        !valuesEqual(unit.ram_gb, memorySummary.totalGb)
        || !valuesEqual(unit.ram_type_config_value_id, memorySummary.ramTypeConfigValueId)
      );
      const storageMismatch = Boolean(storageSummary) && (
        !valuesEqual(unit.storage_gb, storageSummary.totalGb)
        || !valuesEqual(unit.storage_type_config_value_id, storageSummary.storageTypeConfigValueId)
      );

      if (!memoryMismatch && !storageMismatch) continue;
      changes.push({
        unitId,
        memoryRows,
        storageRows,
        memorySummary,
        storageSummary,
        memoryMismatch,
        storageMismatch,
        current: {
          ramGb: nullableNumber(unit.ram_gb),
          ramTypeConfigValueId: nullableNumber(unit.ram_type_config_value_id),
          storageGb: nullableNumber(unit.storage_gb),
          storageTypeConfigValueId: nullableNumber(unit.storage_type_config_value_id)
        }
      });
    }

    console.log(`\nCurrent hardware summary sync (${APPLY ? 'apply' : 'dry-run'})`);
    console.log(`Units scanned: ${Number(unitCountRow?.row_count || 0)}`);
    console.log(`Units with current memory rows: ${memoryByUnit.size}`);
    console.log(`Units with current storage rows: ${storageByUnit.size}`);
    console.log(`Units needing summary reconciliation: ${changes.length}`);

    for (const change of changes.slice(0, 100)) {
      const parts = [];
      if (change.memoryMismatch) {
        parts.push(`memory ${change.current.ramGb ?? '—'}GB/type ${change.current.ramTypeConfigValueId ?? '—'} -> ${change.memorySummary.totalGb ?? '—'}GB/type ${change.memorySummary.ramTypeConfigValueId ?? '—'}`);
      }
      if (change.storageMismatch) {
        parts.push(`storage ${change.current.storageGb ?? '—'}GB/type ${change.current.storageTypeConfigValueId ?? '—'} -> ${change.storageSummary.totalGb ?? '—'}GB/type ${change.storageSummary.storageTypeConfigValueId ?? '—'}`);
      }
      console.log(`- Unit ${change.unitId}: ${parts.join('; ')}`);
    }
    if (changes.length > 100) console.log(`- ... ${changes.length - 100} additional Unit(s)`);

    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply after reviewing the report.');
      return;
    }

    await connection.beginTransaction();
    try {
      for (const change of changes) {
        if (change.memoryMismatch) await syncMemorySummary(connection, change.unitId, change.memoryRows);
        if (change.storageMismatch) await syncStorageSummary(connection, change.unitId, change.storageRows);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    console.log(`\nReconciled ${changes.length} Unit summary record(s).`);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
