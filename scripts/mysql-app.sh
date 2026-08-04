#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose exec -T mysql sh -lc '
  : "${MYSQL_DATABASE:?MYSQL_DATABASE is not set in the mysql container}"
  : "${MYSQL_USER:?MYSQL_USER is not set in the mysql container}"
  : "${MYSQL_PASSWORD:?MYSQL_PASSWORD is not set in the mysql container}"

  export MYSQL_PWD="$MYSQL_PASSWORD"
  exec mysql --protocol=socket -u "$MYSQL_USER" "$MYSQL_DATABASE" "$@"
' sh "$@"
