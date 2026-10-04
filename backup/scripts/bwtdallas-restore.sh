#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE="${1:-}"
MODE=""
CONFIRM=0
APP_DIR="${APP_DIR:-/home/bwtdallas-webserver/app}"

usage() {
  cat <<'EOF'
Usage:
  bwtdallas-restore.sh Backup-YYYY-MM-DD-HHMMSS.zip --confirm-replace
  bwtdallas-restore.sh Purge-YYYY-MM-DD-HHMMSS.zip --development

Options:
  --confirm-replace   Required for full/prod-style replacement restores.
  --development       Restore a Purge archive as a local development stack.
EOF
}

[[ -n "$ARCHIVE" ]] || { usage; exit 2; }
shift || true
while (($#)); do
  case "$1" in
    --confirm-replace) CONFIRM=1 ;;
    --development) MODE="development" ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

[[ -f "$ARCHIVE" ]] || { echo "Archive not found: $ARCHIVE" >&2; exit 1; }
for cmd in docker unzip sha256sum tar openssl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Required command missing: $cmd" >&2; exit 1; }
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -x "$SCRIPT_DIR/bwtdallas-verify-backup.sh" ]]; then
  "$SCRIPT_DIR/bwtdallas-verify-backup.sh" "$ARCHIVE"
else
  unzip -tq "$ARCHIVE" >/dev/null
fi

TMP="$(mktemp -d)"
ROLLBACK_DIR=""
cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

unzip -q "$ARCHIVE" -d "$TMP"
ROOT="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -print -quit)"
[[ -d "$ROOT" ]] || { echo "Could not locate extracted archive root." >&2; exit 1; }

if [[ "$MODE" == "development" ]]; then
  [[ -f "$ROOT/database/bwtdallas-purged.sql" ]] || { echo "--development requires a Purge archive." >&2; exit 1; }
  DB_DUMP="$ROOT/database/bwtdallas-purged.sql"
else
  [[ "$CONFIRM" == "1" ]] || { echo "Full restore requires --confirm-replace." >&2; exit 1; }
  [[ -f "$ROOT/database/bwtdallas-full.sql" ]] || { echo "Full restore requires a Backup archive." >&2; exit 1; }
  DB_DUMP="$ROOT/database/bwtdallas-full.sql"
fi

if [[ -d "$APP_DIR" && -f "$APP_DIR/docker-compose.yml" ]]; then
  (
    cd "$APP_DIR"
    docker compose down || true
  )
fi

if [[ -e "$APP_DIR" ]]; then
  ROLLBACK_DIR="${APP_DIR}.before-restore-$(date +%Y%m%d-%H%M%S)"
  mv "$APP_DIR" "$ROLLBACK_DIR"
  echo "Previous application directory preserved at: $ROLLBACK_DIR"
fi

mkdir -p "$APP_DIR"
tar -xzf "$ROOT/application/application.tar.gz" -C "$APP_DIR"
mkdir -p "$APP_DIR/mysql/data" "$APP_DIR/backup"

if [[ "$MODE" == "development" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  SCANTOOLS_SECRET="$(openssl rand -hex 32)"
  TECHTOOLS_SECRET="$(openssl rand -hex 32)"
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=development
PORT=3000
BASE_URL=http://127.0.0.1:3000
DB_HOST=mysql
DB_PORT=3306
DB_NAME=bwtdallas_dev
DB_USER=bwtdallas
DB_PASSWORD=$DB_PASSWORD
DB_ROOT_PASSWORD=$DB_ROOT_PASSWORD
SESSION_SECRET=$SESSION_SECRET
SCANTOOLS_API_SECRET=$SCANTOOLS_SECRET
TECHTOOLS_API_SECRET=$TECHTOOLS_SECRET
BWT_API_SESSION_HOURS=8
PASSWORD_SETUP_EXPIRES_HOURS=24
CONFIG_USAGE_RANKING_REFRESH_MINUTES=60
EOF
  cp "$ROOT/development/docker-compose.development.yml" "$APP_DIR/docker-compose.development.yml"
fi

docker load -i "$ROOT/docker/app-image.tar" >/dev/null

cd "$APP_DIR"
docker network inspect proxy >/dev/null 2>&1 || docker network create proxy >/dev/null

if [[ "$MODE" == "development" ]]; then
  COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.development.yml)
else
  COMPOSE=(docker compose)
fi

"${COMPOSE[@]}" up -d mysql

for _ in {1..60}; do
  if "${COMPOSE[@]}" exec -T mysql sh -lc 'mysqladmin ping -h localhost -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
"${COMPOSE[@]}" exec -T mysql sh -lc 'mysqladmin ping -h localhost -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1 || {
  echo "MySQL did not become healthy." >&2
  exit 1
}

DB_NAME="$(awk -F= '$1=="DB_NAME"{print substr($0,index($0,"=")+1)}' .env)"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Unsafe DB_NAME in restored .env" >&2; exit 1; }

"${COMPOSE[@]}" exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME;'" >/dev/null 2>&1
"${COMPOSE[@]}" exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $DB_NAME" < "$DB_DUMP" 2>/dev/null

TABLE_COUNT="$("${COMPOSE[@]}" exec -T mysql sh -lc "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\"$DB_NAME\" AND table_type=\"BASE TABLE\";'" 2>/dev/null)"
(( TABLE_COUNT > 0 )) || { echo "Database restore produced no tables." >&2; exit 1; }

"${COMPOSE[@]}" up -d

echo
echo "Restore completed successfully."
echo "Application directory: $APP_DIR"
echo "Database tables restored: $TABLE_COUNT"
if [[ "$MODE" == "development" ]]; then
  echo "Development app: http://127.0.0.1:3000"
  echo "Development phpMyAdmin: http://127.0.0.1:8081"
fi
if [[ -n "$ROLLBACK_DIR" ]]; then
  echo "Previous installation retained at: $ROLLBACK_DIR"
fi
