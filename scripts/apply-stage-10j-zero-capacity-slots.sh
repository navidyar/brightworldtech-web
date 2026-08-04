#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10J zero-capacity slot migration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME IN ('units', 'unit_memory_modules', 'unit_storage_devices', 'unit_previous_memory_modules', 'unit_previous_storage_devices')),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND (
       (TABLE_NAME = 'units' AND COLUMN_NAME IN ('previous_ram_gb', 'ram_gb', 'previous_storage_gb', 'storage_gb'))
       OR (TABLE_NAME IN ('unit_memory_modules', 'unit_storage_devices', 'unit_previous_memory_modules', 'unit_previous_storage_devices') AND COLUMN_NAME = 'size_gb')
     )),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME IN ('unit_memory_modules', 'unit_previous_memory_modules')
     AND COLUMN_NAME = 'memory_install_type_code')
);
SQL
)"

if [[ "$preflight" != "5:8:2" ]]; then
  printf 'Stage 10J preflight failed (received %s; expected 5:8:2).\n' "$preflight" >&2
  printf '%s\n' 'Apply and verify Stages 10C and 10D before Stage 10J.' >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10j-zero-capacity-slots.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*)
   FROM information_schema.TABLE_CONSTRAINTS tc
   INNER JOIN information_schema.CHECK_CONSTRAINTS cc
     ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
    AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
   WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
     AND tc.CONSTRAINT_NAME IN (
       'chk_units_previous_ram_gb',
       'chk_units_ram_gb',
       'chk_units_previous_storage_gb',
       'chk_units_storage_gb',
       'chk_unit_memory_modules_size',
       'chk_unit_storage_devices_size',
       'chk_unit_previous_memory_modules_size',
       'chk_unit_previous_storage_devices_size'
     )
     AND tc.CONSTRAINT_TYPE = 'CHECK'
     AND REPLACE(REPLACE(LOWER(cc.CHECK_CLAUSE), ' ', ''), '`', '') LIKE '%>=0%'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME IN ('unit_memory_modules', 'unit_previous_memory_modules')
     AND COLUMN_NAME = 'memory_install_type_code'
     AND IS_NULLABLE = 'YES'),
  ':',
  ((SELECT COUNT(*) FROM units
    WHERE previous_ram_gb < 0 OR ram_gb < 0 OR previous_storage_gb < 0 OR storage_gb < 0)
   + (SELECT COUNT(*) FROM unit_memory_modules WHERE size_gb < 0)
   + (SELECT COUNT(*) FROM unit_storage_devices WHERE size_gb < 0)
   + (SELECT COUNT(*) FROM unit_previous_memory_modules WHERE size_gb < 0)
   + (SELECT COUNT(*) FROM unit_previous_storage_devices WHERE size_gb < 0))
);
SQL
)"

if [[ "$readiness" != "8:2:0" ]]; then
  printf 'Stage 10J readiness check failed (received %s; expected 8:2:0).\n' "$readiness" >&2
  printf '%s\n' 'Run: bash scripts/check-stage-10j-zero-capacity-slots.sh' >&2
  exit 1
fi

printf '%s\n' 'Stage 10J zero-capacity slot migration verified complete.'
