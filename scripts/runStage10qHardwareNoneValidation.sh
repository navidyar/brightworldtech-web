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
FROM config_values cv
INNER JOIN config_categories cc
  ON cc.config_category_id = cv.config_category_id
WHERE cc.code IN ('hardware_issue_types', 'hardware_issue_type', 'hardware_issues')
  AND COALESCE(cv.is_active, 1) = 1
  AND (
    LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.code, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
      'none', 'no_issue', 'no_issues', 'hardware_none', 'hardware_issue_none', 'no_hardware_issue', 'no_hardware_issues'
    )
    OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.label, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
      'none', 'no_issue', 'no_issues', 'hardware_none', 'hardware_issue_none', 'no_hardware_issue', 'no_hardware_issues'
    )
    OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.value, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
      'none', 'no_issue', 'no_issues', 'hardware_none', 'hardware_issue_none', 'no_hardware_issue', 'no_hardware_issues'
    )
  );
SQL
)"

if [[ ! "$none_count" =~ ^[0-9]+$ || "$none_count" -lt 1 ]]; then
  printf 'Stage 10Q database validation failed: found %s active Hardware None option(s).\n' "$none_count" >&2
  exit 1
fi

printf 'Stage 10Q Hardware None valid: %s active semantic None option(s).\n' "$none_count"
