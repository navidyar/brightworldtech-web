#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/stage10qHardwareNoneIntegration.test.js \
  services/stage10pModalCloseCosmeticNoneIntegration.test.js \
  services/unitFormSubmissionPolicy.test.js

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
none_count="$(bash "$MYSQL_RUNNER" --batch --skip-column-names <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*)
FROM system_config_values scv
INNER JOIN config_values cv
  ON cv.config_value_id = scv.config_value_id
WHERE scv.system_config_value_id = 242
  AND COALESCE(cv.is_active, 1) = 1;
SQL
)"

if [[ ! "$none_count" =~ ^[0-9]+$ || "$none_count" -lt 1 ]]; then
  printf 'Stage 10Q database validation failed: found %s active Hardware None option(s).\n' "$none_count" >&2
  exit 1
fi

printf 'Stage 10Q Hardware None valid: %s active semantic None option(s).\n' "$none_count"
