#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f /.dockerenv ]]; then
  exec node scripts/validateStage9dQcGradingFoundation.js
fi
exec docker compose exec -T app node scripts/validateStage9dQcGradingFoundation.js
