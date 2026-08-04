#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10D structured Previous Memory and Previous Storage migration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config_values'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units' AND COLUMN_NAME = 'previous_ram_gb'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units' AND COLUMN_NAME = 'previous_storage_gb')
);
SQL
)"

if [[ "$preflight" != "1:1:1:1:1" ]]; then
  printf 'Stage 10D preflight failed (received %s; expected 1:1:1:1:1).\n' "$preflight" >&2
  printf '%s\n' 'Apply and verify Stage 10C before Stage 10D. The units, config_values, and users tables must also exist.' >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10d-previous-hardware-components.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
     AND COLUMN_NAME IN ('unit_previous_memory_module_id', 'unit_id', 'sort_order', 'slot_label', 'size_gb', 'ram_type_config_value_id', 'memory_install_type_code', 'speed_mhz', 'manufacturer_name', 'part_number', 'serial_number', 'change_notes', 'changed_by_user_id', 'created_at', 'updated_at')),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
     AND INDEX_NAME IN ('PRIMARY', 'idx_unit_previous_memory_modules_unit_sort', 'idx_unit_previous_memory_modules_ram_type', 'idx_unit_previous_memory_modules_changed_by')),
  ':',
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
     AND CONSTRAINT_NAME IN ('fk_unit_previous_memory_modules_unit', 'fk_unit_previous_memory_modules_ram_type', 'fk_unit_previous_memory_modules_changed_by')),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_memory_modules'
     AND CONSTRAINT_TYPE = 'CHECK'
     AND CONSTRAINT_NAME IN ('chk_unit_previous_memory_modules_install_type', 'chk_unit_previous_memory_modules_size', 'chk_unit_previous_memory_modules_speed')),
  ':',
  (SELECT COUNT(*) FROM unit_previous_memory_modules
   WHERE (size_gb IS NOT NULL AND size_gb < 0)
      OR (speed_mhz IS NOT NULL AND speed_mhz <= 0)
      OR memory_install_type_code NOT IN ('removable_module', 'integrated_soldered', 'unknown')),
  ':',
  (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
     AND COLUMN_NAME IN ('unit_previous_storage_device_id', 'unit_id', 'sort_order', 'slot_label', 'storage_type_config_value_id', 'size_gb', 'manufacturer_name', 'model_number', 'serial_number', 'firmware_version', 'wipe_status_config_value_id', 'change_notes', 'changed_by_user_id', 'created_at', 'updated_at')),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
     AND INDEX_NAME IN ('PRIMARY', 'idx_unit_previous_storage_devices_unit_sort', 'idx_unit_previous_storage_devices_type', 'idx_unit_previous_storage_devices_wipe', 'idx_unit_previous_storage_devices_changed_by')),
  ':',
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
     AND CONSTRAINT_NAME IN ('fk_unit_previous_storage_devices_unit', 'fk_unit_previous_storage_devices_type', 'fk_unit_previous_storage_devices_wipe', 'fk_unit_previous_storage_devices_changed_by')),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_previous_storage_devices'
     AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'chk_unit_previous_storage_devices_size'),
  ':',
  (SELECT COUNT(*) FROM unit_previous_storage_devices WHERE size_gb IS NOT NULL AND size_gb < 0)
);
SQL
)"

if [[ "$readiness" != "15:4:3:3:0:15:5:4:1:0" ]]; then
  printf 'Stage 10D readiness check failed (received %s; expected 15:4:3:3:0:15:5:4:1:0).\n' "$readiness" >&2
  printf '%s\n' 'Run: bash scripts/check-stage-10d-previous-hardware-components.sh' >&2
  exit 1
fi

printf '%s\n' 'Stage 10D structured Previous Memory and Previous Storage migration verified complete.'
