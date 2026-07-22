#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/bwtdallas-webserver/app}"
HANDOFF_DIR="${HANDOFF_DIR:-$APP_DIR/handoff}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SNAPSHOT_NAME="bwtdallas-db-review-$TIMESTAMP"
SNAPSHOT_DIR="$HANDOFF_DIR/$SNAPSHOT_NAME"
ARCHIVE_PATH="$HANDOFF_DIR/$SNAPSHOT_NAME.tar.gz"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or is not in PATH."
[[ -d "$APP_DIR" ]] || fail "Application directory not found: $APP_DIR"
[[ -f "$APP_DIR/docker-compose.yml" || -f "$APP_DIR/compose.yml" || -f "$APP_DIR/compose.yaml" ]] \
  || fail "No Compose file was found in $APP_DIR"

cd "$APP_DIR"
mkdir -p "$SNAPSHOT_DIR"

if ! docker compose ps --status running mysql 2>/dev/null | grep -qE 'mysql|bwtdallas-mysql-app'; then
  fail "The MySQL Compose service is not running. Run: cd $APP_DIR && docker compose up -d mysql"
fi

printf 'Creating database review snapshot...\n'
printf 'Output folder: %s\n' "$SNAPSHOT_DIR"

{
  printf 'BWTDallas database review snapshot\n'
  printf 'Created: %s\n' "$(date --iso-8601=seconds)"
  printf 'Application directory: %s\n\n' "$APP_DIR"
  printf '%s\n' 'This archive contains:'
  printf '%s\n' '- complete database structure, including tables, views, indexes, constraints, triggers, routines, and events'
  printf '%s\n' '- data from business/application tables'
  printf '%s\n' '- row counts and object inventory'
  printf '%s\n' '- a sanitized user/role directory without email addresses or password hashes'
  printf '\n%s\n' 'Data intentionally omitted from review-data.sql:'
  printf '%s\n' '- sessions'
  printf '%s\n' '- users'
  printf '%s\n' '- user_password_links'
  printf '%s\n' '- user_login_activity'
  printf '\n%s\n' 'The schema for those omitted tables is still included in schema.sql.'
  printf '%s\n' 'Operational records may still contain asset tags, serial numbers, comments, and other internal business data.'
} > "$SNAPSHOT_DIR/README.txt"

{
  printf '=== Docker Compose MySQL service ===\n'
  docker compose ps mysql
  printf '\n=== MySQL connection metadata ===\n'
  docker compose exec -T mysql sh -lc '
    mysql --batch --raw \
      -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
      -e "SELECT DATABASE() AS database_name, VERSION() AS mysql_version, NOW() AS server_time;"
  '
} > "$SNAPSHOT_DIR/database-metadata.txt"

printf '  1/5 Exporting complete schema...\n'
docker compose exec -T mysql sh -lc '
  exec mysqldump \
    --no-tablespaces \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --no-data \
    --hex-blob \
    -uroot -p"$MYSQL_ROOT_PASSWORD" \
    "$MYSQL_DATABASE"
' > "$SNAPSHOT_DIR/schema.sql"

printf '  2/5 Exporting review-safe application data...\n'
docker compose exec -T mysql sh -lc '
  set --
  while IFS= read -r table_name; do
    set -- "$@" "$table_name"
  done <<TABLES
$(mysql --batch --skip-column-names \
  -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
  -e "
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = '\''BASE TABLE'\''
      AND table_name NOT IN (
        '\''sessions'\'',
        '\''users'\'',
        '\''user_password_links'\'',
        '\''user_login_activity'\''
      )
    ORDER BY table_name;
  ")
TABLES

  if [ "$#" -eq 0 ]; then
    exit 0
  fi

  exec mysqldump \
    --no-tablespaces \
    --single-transaction \
    --quick \
    --skip-triggers \
    --no-create-info \
    --complete-insert \
    --hex-blob \
    -uroot -p"$MYSQL_ROOT_PASSWORD" \
    "$MYSQL_DATABASE" "$@"
' > "$SNAPSHOT_DIR/review-data.sql"

printf '  3/5 Recording database objects and row counts...\n'
docker compose exec -T mysql sh -lc '
  mysql --batch --raw \
    -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
    -e "
      SELECT
        table_name,
        table_type,
        COALESCE(engine, '\''-'\'') AS engine,
        COALESCE(table_collation, '\''-'\'') AS table_collation
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      ORDER BY table_type, table_name;
    "
' > "$SNAPSHOT_DIR/database-objects.tsv"

docker compose exec -T mysql sh -lc '
  printf "table_name\trow_count\n"
  mysql --batch --skip-column-names \
    -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
    -e "
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = '\''BASE TABLE'\''
      ORDER BY table_name;
    " |
  while IFS= read -r table_name; do
    escaped_name=$(printf "%s" "$table_name" | sed "s/\`/\`\`/g")
    row_count=$(mysql --batch --skip-column-names \
      -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
      -e "SELECT COUNT(*) FROM \`$escaped_name\`;" )
    printf "%s\t%s\n" "$table_name" "$row_count"
  done
' > "$SNAPSHOT_DIR/table-row-counts.tsv"

printf '  4/5 Exporting sanitized user and role references...\n'
if docker compose exec -T mysql sh -lc '
  mysql --batch --skip-column-names \
    -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
    -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '\''users'\'';"
' | grep -qx '1'; then
  docker compose exec -T mysql sh -lc '
    mysql --batch --raw \
      -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
      -e "
        SELECT
          u.user_id,
          u.first_name,
          u.last_name,
          u.is_active,
          GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR '\'', '\'') AS role_codes
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN roles r ON r.role_id = ur.role_id
        GROUP BY u.user_id, u.first_name, u.last_name, u.is_active
        ORDER BY u.user_id;
      "
  ' > "$SNAPSHOT_DIR/users-sanitized.tsv"
else
  printf 'users table was not present\n' > "$SNAPSHOT_DIR/users-sanitized.tsv"
fi

printf '  5/5 Packaging snapshot...\n'
tar -czf "$ARCHIVE_PATH" -C "$HANDOFF_DIR" "$SNAPSHOT_NAME"

printf '\nSnapshot created successfully:\n%s\n' "$ARCHIVE_PATH"
printf '\nUpload that .tar.gz file together with the current application ZIP.\n'
printf 'The uncompressed working folder was retained at:\n%s\n' "$SNAPSHOT_DIR"
