#!/usr/bin/env bash
set -euo pipefail

if node -e "require.resolve('mysql2/promise')" >/dev/null 2>&1; then
  exec node scripts/validateLotValidationReader.js
fi

if command -v docker >/dev/null 2>&1 \
  && docker compose ps -q app 2>/dev/null | grep -q .; then
  echo "Host dependencies are not installed; running validation inside the app container."
  exec docker compose exec -T app node scripts/validateLotValidationReader.js
fi

cat >&2 <<'MESSAGE'
The app dependency mysql2/promise is not available in this shell.
Run the validator from /home/bwtdallas-webserver/app with the app container running:

  docker compose exec -T app npm run validate:lot-validation
MESSAGE
exit 1
