#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/stage10w1UnitBrowserResponsiveBatteryRequirementIntegration.test.js \
  services/stage10aUnitExportFoundationCorrections.test.js

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
readiness="$(bash "$MYSQL_RUNNER" --batch --skip-column-names <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*)
FROM system_config_values scv
INNER JOIN config_values cv
  ON cv.config_value_id = scv.config_value_id
WHERE scv.system_config_value_id = 318
  AND COALESCE(cv.is_active, 1) = 1;
SQL
)"

if [[ "$readiness" != "1" ]]; then
  printf 'Stage 10W.1 database validation failed: found %s active Battery Health requirement type(s).\n' "$readiness" >&2
  exit 1
fi

printf '%s\n' 'Stage 10W.1 responsive Unit Browser and Battery Health requirement valid.'
