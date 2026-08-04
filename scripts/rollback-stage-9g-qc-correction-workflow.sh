#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

row_count="$(bash scripts/mysql-app.sh --batch --skip-column-names <<'SQL' | tr -d '[:space:]'
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'
  ) THEN (SELECT COUNT(*) FROM unit_qc_corrections)
  ELSE 0
END;
SQL
)"

if [[ "$row_count" != "0" && "${FORCE_STAGE_9G_ROLLBACK:-0}" != "1" ]]; then
  printf 'Stage 9G rollback refused because unit_qc_corrections contains %s row(s).\n' "$row_count" >&2
  printf '%s\n' 'Set FORCE_STAGE_9G_ROLLBACK=1 only after confirming those audit records may be removed.' >&2
  exit 1
fi

bash scripts/mysql-app.sh < sql/2026-07-stage-9g-qc-correction-workflow-rollback.sql
printf '%s\n' 'Stage 9G Quality Control correction workflow rollback complete.'
