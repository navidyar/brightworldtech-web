'use strict';

const { pool } = require('./db');

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.row_count || 0) === 1;
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.row_count || 0) === 1;
}

async function getToolDetailsForUnit(unitId) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) return null;

  const [[unit]] = await pool.query('SELECT unit_id FROM units WHERE unit_id = ? LIMIT 1', [safeUnitId]);
  if (!unit) return null;

  const windowsDisplayVersionSelect = await columnExists('unit_specifications', 'windows_display_version')
    ? 'windows_display_version'
    : 'NULL AS windows_display_version';
  const [specRows] = await pool.query(
    `SELECT
       ${windowsDisplayVersionSelect},
       touchscreen_hardware_state_code,
       wifi_hardware_state_code, wifi_technology, wifi_adapter_model,
       lte_hardware_state_code, lte_technology, lte_module_model, lte_imei,
       secure_boot_state_code,
       tpm_hardware_state_code, tpm_version, tpm_enabled_state_code, tpm_activated_state_code,
       keyboard_backlight_state_code,
       ac_adapter_wattage,
       bios_adapter_warning_state_code, bios_adapter_warning_message,
       battery_hardware_state_code, battery_health_percent_observed,
       camera_hardware_state_code, fingerprint_hardware_state_code
     FROM unit_specifications
     WHERE unit_id = ?
     LIMIT 1`,
    [safeUnitId]
  );

  const [storage] = await pool.query(
    `SELECT
       unit_storage_device_id, slot_label, size_gb, model_number, serial_number, firmware_version,
       raw_size_bytes, storage_interface, media_type, health_status, storage_install_type_code, is_current
     FROM unit_storage_devices
     WHERE unit_id = ? AND is_current = 1
     ORDER BY unit_storage_device_id`,
    [safeUnitId]
  );

  const [graphics] = await pool.query(
    `SELECT
       unit_graphics_adapter_id, gpu_vendor, gpu_model, gpu_role_code, vram_mb, vram_source, sort_order
     FROM unit_graphics_adapters
     WHERE unit_id = ?
     ORDER BY sort_order, unit_graphics_adapter_id`,
    [safeUnitId]
  );

  const [toolRuns] = await pool.query(
    `SELECT tool_run_id, tool_source, user_id, report_id, report_schema, tool_version,
            collected_at, received_at, completed_at, status
       FROM unit_tool_runs
      WHERE unit_id = ?
      ORDER BY received_at DESC, tool_run_id DESC
      LIMIT 10`,
    [safeUnitId]
  );

  let wipeCertificates = [];
  if (await tableExists('unit_storage_wipe_certificates')) {
    const [rows] = await pool.query(
      `SELECT unit_storage_wipe_certificate_id, unit_storage_device_id, certificate_id,
              certificate_status, started_at, completed_at, drive_model, drive_serial,
              drive_size_bytes, drive_interface, drive_media_type, wipe_method, wipe_result,
              verification_statement, created_at
         FROM unit_storage_wipe_certificates
        WHERE unit_id = ?
        ORDER BY COALESCE(completed_at, created_at) DESC, unit_storage_wipe_certificate_id DESC
        LIMIT 10`,
      [safeUnitId]
    );
    wipeCertificates = rows;
  }

  return {
    unitId: safeUnitId,
    specifications: specRows[0] || null,
    storage,
    graphics,
    wipeCertificates,
    toolRuns
  };
}

module.exports = {
  getToolDetailsForUnit
};
