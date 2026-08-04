'use strict';

const { pool } = require('../models/db');

async function main() {
  try {
    const [rows] = await pool.query(`
      SELECT CONCAT(
        (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
     AND COLUMN_NAME IN ('unit_previous_memory_module_id', 'unit_id', 'sort_order', 'slot_label', 'size_gb', 'ram_type_config_value_id', 'memory_install_type_code', 'speed_mhz', 'manufacturer_name', 'part_number', 'serial_number', 'change_notes', 'changed_by_user_id', 'created_at', 'updated_at')), ':',
        (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
           AND INDEX_NAME IN ('PRIMARY', 'idx_unit_previous_memory_modules_unit_sort', 'idx_unit_previous_memory_modules_ram_type', 'idx_unit_previous_memory_modules_changed_by')), ':',
        (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
           AND CONSTRAINT_NAME IN ('fk_unit_previous_memory_modules_unit', 'fk_unit_previous_memory_modules_ram_type', 'fk_unit_previous_memory_modules_changed_by')), ':',
        (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
           AND CONSTRAINT_TYPE = 'CHECK'
           AND CONSTRAINT_NAME IN ('chk_unit_previous_memory_modules_install_type', 'chk_unit_previous_memory_modules_size', 'chk_unit_previous_memory_modules_speed')), ':',
        (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
     AND COLUMN_NAME IN ('unit_previous_storage_device_id', 'unit_id', 'sort_order', 'slot_label', 'storage_type_config_value_id', 'size_gb', 'manufacturer_name', 'model_number', 'serial_number', 'firmware_version', 'wipe_status_config_value_id', 'change_notes', 'changed_by_user_id', 'created_at', 'updated_at')), ':',
        (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
           AND INDEX_NAME IN ('PRIMARY', 'idx_unit_previous_storage_devices_unit_sort', 'idx_unit_previous_storage_devices_type', 'idx_unit_previous_storage_devices_wipe', 'idx_unit_previous_storage_devices_changed_by')), ':',
        (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
           AND CONSTRAINT_NAME IN ('fk_unit_previous_storage_devices_unit', 'fk_unit_previous_storage_devices_type', 'fk_unit_previous_storage_devices_wipe', 'fk_unit_previous_storage_devices_changed_by')), ':',
        (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
           AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'chk_unit_previous_storage_devices_size')
      ) AS readiness_signature
    `);

    const signature = String(rows[0] && rows[0].readiness_signature || '');
    if (signature !== '15:4:3:3:15:5:4:1') {
      throw new Error(`Stage 10D database readiness is ${signature}; expected 15:4:3:3:15:5:4:1.`);
    }

    const [[counts]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM unit_previous_memory_modules) AS previous_memory_rows,
        (SELECT COUNT(*) FROM unit_previous_storage_devices) AS previous_storage_rows
    `);

    console.log(
      `Stage 10D Previous hardware valid: ${Number(counts.previous_memory_rows || 0)} memory row(s), `
      + `${Number(counts.previous_storage_rows || 0)} storage row(s).`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
