#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

existing_values="$("${MYSQL[@]}" <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*)
FROM units
WHERE previous_ram_gb IS NOT NULL
   OR previous_storage_gb IS NOT NULL;
SQL
)"

if [[ "$existing_values" != "0" ]]; then
  printf 'Stage 10C rollback refused: %s Unit(s) contain previous hardware values.\n' "$existing_values" >&2
  printf '%s\n' 'Export or manually preserve those values before attempting a destructive rollback.' >&2
  exit 1
fi

"${MYSQL[@]}" <<'SQL'
ALTER TABLE units
  DROP CHECK chk_units_previous_ram_gb,
  DROP CHECK chk_units_previous_storage_gb,
  DROP COLUMN previous_ram_gb,
  DROP COLUMN previous_storage_gb;
SQL

printf '%s\n' 'Stage 10C previous/current hardware columns removed.'
