#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if node -e "require.resolve('mysql2/promise')" >/dev/null 2>&1; then
  exec node scripts/validateStage5dLotValidationOverrides.js
fi

if command -v docker >/dev/null 2>&1; then
  exec docker compose exec -T app node scripts/validateStage5dLotValidationOverrides.js
fi

echo "mysql2/promise is not installed on the host and Docker is unavailable." >&2
exit 1
