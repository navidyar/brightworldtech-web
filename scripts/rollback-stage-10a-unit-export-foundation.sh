#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${CONFIRM_STAGE10A_DATA_LOSS:-}" != "1" ]]; then
  printf '%s\n' 'Rollback refused. This removes Battery Health values and Processor Family Short Forms.' >&2
  printf '%s\n' 'Set CONFIRM_STAGE10A_DATA_LOSS=1 only after restoring or preserving the affected data.' >&2
  exit 1
fi

bash scripts/mysql-app.sh <<'SQL'
ALTER TABLE units DROP CHECK chk_units_battery_health_percent;
ALTER TABLE units DROP COLUMN battery_health_percent;
ALTER TABLE processor_families DROP COLUMN export_short_form;
SQL

printf '%s\n' 'Stage 10A database columns removed.'
