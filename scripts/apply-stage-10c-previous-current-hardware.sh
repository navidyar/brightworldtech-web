#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10C previous/current memory and storage migration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units' AND COLUMN_NAME = 'ram_gb'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units' AND COLUMN_NAME = 'storage_gb')
);
SQL
)"

if [[ "$preflight" != "1:1:1" ]]; then
  printf 'Stage 10C preflight failed (received %s; expected 1:1:1).\n' "$preflight" >&2
  printf '%s\n' 'The units table and its current ram_gb/storage_gb columns must exist.' >&2
  exit 1
fi

for column_name in previous_ram_gb previous_storage_gb; do
  column_exists="$(scalar_query <<SQL
SELECT COUNT(*)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'units'
  AND COLUMN_NAME = '$column_name';
SQL
)"

  if [[ "$column_exists" == "1" ]]; then
    invalid_values="$(scalar_query <<SQL
SELECT COUNT(*)
FROM units
WHERE $column_name IS NOT NULL
  AND $column_name <= 0;
SQL
)"

    if [[ "$invalid_values" != "0" ]]; then
      printf 'Stage 10C stopped: %s contains %s non-positive value(s).\n' "$column_name" "$invalid_values" >&2
      printf '%s\n' 'Correct or preserve those values before rerunning the idempotent migration.' >&2
      exit 1
    fi
  fi
done

"${MYSQL[@]}" < sql/2026-07-stage-10c-previous-current-hardware.sql

readiness="$(scalar_query <<'SQL'
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
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'units'
     AND CONSTRAINT_NAME IN ('chk_units_previous_ram_gb', 'chk_units_previous_storage_gb')
     AND CONSTRAINT_TYPE = 'CHECK'),
  ':',
  (SELECT COUNT(*) FROM units
   WHERE (previous_ram_gb IS NOT NULL AND previous_ram_gb < 0)
      OR (previous_storage_gb IS NOT NULL AND previous_storage_gb < 0))
);
SQL
)"

if [[ "$readiness" != "1:1:2:0" ]]; then
  printf 'Stage 10C readiness check failed (received %s; expected 1:1:2:0).\n' "$readiness" >&2
  printf '%s\n' 'Run: bash scripts/check-stage-10c-previous-current-hardware.sh' >&2
  exit 1
fi

printf '%s\n' 'Stage 10C previous/current memory and storage migration verified complete.'
