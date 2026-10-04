#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/bwtdallas-webserver/app}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backup}"
KEEP_BACKUPS="${KEEP_BACKUPS:-2}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
FULL_NAME="Backup-$STAMP"
PURGE_NAME="Purge-$STAMP"
WORK_DIR=""
VERIFY_DB=""
PURGE_DB=""

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

cleanup() {
  if [[ -n "$VERIFY_DB" ]]; then
    docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE IF EXISTS $VERIFY_DB;'" >/dev/null 2>&1 || true
  fi
  if [[ -n "$PURGE_DB" ]]; then
    docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE IF EXISTS $PURGE_DB;'" >/dev/null 2>&1 || true
  fi
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

for cmd in docker zip unzip sha256sum tar awk sed sort find df; do
  require_cmd "$cmd"
done

[[ -d "$APP_DIR" ]] || fail "Application directory not found: $APP_DIR"
[[ -f "$APP_DIR/docker-compose.yml" ]] || fail "docker-compose.yml not found in $APP_DIR"
mkdir -p "$BACKUP_DIR"

available_mb="$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
[[ "$available_mb" =~ ^[0-9]+$ ]] || fail "Could not determine free disk space."
(( available_mb >= MIN_FREE_MB )) || fail "Only ${available_mb} MB free; at least ${MIN_FREE_MB} MB is required."

cd "$APP_DIR"
docker compose ps --status running mysql | grep -q 'bwtdallas-mysql-app' || fail "MySQL Compose service is not running."

DB_NAME="$(docker compose exec -T mysql sh -lc 'printf "%s" "$MYSQL_DATABASE"')"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || fail "Unsafe database name: $DB_NAME"

SUPER_ADMIN_COUNT="$(docker compose exec -T mysql sh -lc 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "
SELECT COUNT(DISTINCT u.user_id)
FROM users u
JOIN user_roles ur ON ur.user_id=u.user_id
JOIN roles r ON r.role_id=ur.role_id
WHERE r.system_key=\"super_admin\";
"' 2>/dev/null)"
[[ "$SUPER_ADMIN_COUNT" == "1" ]] || fail "Expected exactly one Super Admin user; found $SUPER_ADMIN_COUNT."

APP_IMAGE_REF="$(docker inspect -f '{{.Config.Image}}' bwtdallas-app)"
[[ -n "$APP_IMAGE_REF" ]] || fail "Could not determine the running BWTDallas app image."

WORK_DIR="$(mktemp -d "$BACKUP_DIR/.backup-work-$STAMP-XXXXXX")"
COMMON="$WORK_DIR/common"
FULL_ROOT="$WORK_DIR/$FULL_NAME"
PURGE_ROOT="$WORK_DIR/$PURGE_NAME"
mkdir -p "$COMMON" "$FULL_ROOT"/{application,backup-tools/systemd,database,docker,manifest} "$PURGE_ROOT"/{application,backup-tools/systemd,database,docker,development,manifest}

printf '1/8 Creating consistent production database dump...\n'
docker compose exec -T mysql sh -lc 'exec mysqldump \
  --no-tablespaces \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --set-gtid-purged=OFF \
  -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > "$COMMON/full.sql"
[[ -s "$COMMON/full.sql" ]] || fail "Database dump is empty."

printf '2/8 Verifying full dump by restoring it into an isolated temporary database...\n'
VERIFY_DB="bwtdallas_verify_$(date +%Y%m%d%H%M%S)_$$"
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE IF EXISTS $VERIFY_DB; CREATE DATABASE $VERIFY_DB;'" >/dev/null 2>&1
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $VERIFY_DB" < "$COMMON/full.sql" 2>/dev/null
VERIFY_TABLES="$(docker compose exec -T mysql sh -lc "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\"$VERIFY_DB\" AND table_type=\"BASE TABLE\";'" 2>/dev/null)"
SOURCE_TABLES="$(docker compose exec -T mysql sh -lc 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type=\"BASE TABLE\";" "$MYSQL_DATABASE"' 2>/dev/null)"
[[ "$VERIFY_TABLES" == "$SOURCE_TABLES" ]] || fail "Full dump verification table count mismatch: source=$SOURCE_TABLES restored=$VERIFY_TABLES"
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE $VERIFY_DB;'" >/dev/null 2>&1

printf '3/8 Capturing application filesystem and exact app image...\n'
tar -czf "$COMMON/application-full.tar.gz" \
  --exclude='./backup/Backup-*.zip' \
  --exclude='./backup/Purge-*.zip' \
  --exclude='./backup/*.sha256' \
  --exclude='./backup/.backup-work-*' \
  --exclude='./mysql/data' \
  -C "$APP_DIR" .

tar -czf "$COMMON/application-dev.tar.gz" \
  --exclude='./backup/Backup-*.zip' \
  --exclude='./backup/Purge-*.zip' \
  --exclude='./backup/*.sha256' \
  --exclude='./backup/.backup-work-*' \
  --exclude='./mysql/data' \
  --exclude='./.env' \
  -C "$APP_DIR" .

docker save "$APP_IMAGE_REF" -o "$COMMON/app-image.tar"

printf '4/8 Building full recovery package...\n'
cp "$COMMON/full.sql" "$FULL_ROOT/database/bwtdallas-full.sql"
cp "$COMMON/application-full.tar.gz" "$FULL_ROOT/application/application.tar.gz"
cp "$APP_DIR/backup/scripts/"*.sh "$APP_DIR/backup/scripts/README.txt" "$FULL_ROOT/backup-tools/"
cp "$APP_DIR/backup/scripts/systemd/"* "$FULL_ROOT/backup-tools/systemd/"
ln "$COMMON/app-image.tar" "$FULL_ROOT/docker/app-image.tar"
{
  printf 'Created: %s\n' "$(date --iso-8601=seconds)"
  printf 'Source host: %s\n' "$(hostname)"
  printf 'Application directory: %s\n' "$APP_DIR"
  printf 'Database: %s\n' "$DB_NAME"
  printf 'Application image: %s\n' "$APP_IMAGE_REF"
  printf 'Docker: '; docker --version
  printf 'Compose: '; docker compose version
} > "$FULL_ROOT/manifest/versions.txt"
docker compose ps > "$FULL_ROOT/manifest/compose-ps.txt"
docker image inspect "$APP_IMAGE_REF" --format 'Image={{.RepoTags}} ID={{.Id}} Created={{.Created}}' > "$FULL_ROOT/manifest/app-image.txt"
cat > "$FULL_ROOT/README.txt" <<'EOF'
BWTDallas complete recovery backup.
Contains the application filesystem (including production .env), a verified logical MySQL dump,
and the exact locally built BWTDallas application image. MySQL and phpMyAdmin are upstream
images referenced by docker-compose.yml and are intentionally not duplicated in this archive.
Treat this archive as sensitive production data.
EOF

printf '5/8 Building sanitized baseline database...\n'
PURGE_DB="bwtdallas_purge_$(date +%Y%m%d%H%M%S)_$$"
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE IF EXISTS $PURGE_DB; CREATE DATABASE $PURGE_DB;'" >/dev/null 2>&1
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB" < "$COMMON/full.sql" 2>/dev/null

PURGE_TABLES=(
  amazon_asset_tag_sequence
  api_tool_sessions
  label_library_audit_events
  label_print_attempts
  label_print_job_items
  label_print_jobs
  label_print_sets
  label_printer_group_members
  label_printer_groups
  label_printers
  lot_label_template_sets
  lot_label_templates
  lot_requirement_inheritance_suppressions
  lot_requirements
  lot_unit_browser_columns
  lot_unit_browser_layouts
  lot_unit_form_field_rules
  lots
  operational_option_usage_rankings
  operational_option_usage_refresh_state
  permission_audit_events
  productivity_events
  qc_reviewer_audits
  scan_batch_items
  scan_batches
  sessions
  unit_amazon_details
  unit_assignment_history
  unit_audit_event_changes
  unit_audit_events
  unit_batteries
  unit_biometrics
  unit_cameras
  unit_cellular_module_bands
  unit_cellular_modules
  unit_comments
  unit_completion_credits
  unit_duplicate_requests
  unit_field_sources
  unit_grade_assessments
  unit_graphics_adapters
  unit_identifiers
  unit_issue_entries
  unit_issue_flags
  unit_lot_history
  unit_lot_validation_overrides
  unit_memory_modules
  unit_model_catalog_requests
  unit_outcomes
  unit_override_requests
  unit_park_history
  unit_ports
  unit_previous_memory_modules
  unit_previous_storage_devices
  unit_processor_catalog_requests
  unit_qc_checks
  unit_qc_corrections
  unit_qc_reversion_requests
  unit_request_events
  unit_requests
  unit_specifications
  unit_status_history
  unit_storage_devices
  unit_storage_wipe_certificates
  unit_support_tasks
  unit_takeover_requests
  unit_tool_observations
  unit_tool_runs
  unit_work_completions
  unit_work_session_tasks
  unit_work_sessions
  units
  user_login_activity
  user_management_audit
  user_password_links
  virtual_huddle_messages
  virtual_huddle_recipients
  virtual_huddle_targets
)

{
  echo 'SET FOREIGN_KEY_CHECKS=0;'
  for table in "${PURGE_TABLES[@]}"; do
    printf 'TRUNCATE TABLE `%s`;\n' "$table"
  done
  echo 'SET FOREIGN_KEY_CHECKS=1;'
} > "$COMMON/purge.sql"

docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB" < "$COMMON/purge.sql" 2>/dev/null

SUPER_ADMIN_ID="$(docker compose exec -T mysql sh -lc "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB -e '
SELECT u.user_id
FROM users u
JOIN user_roles ur ON ur.user_id=u.user_id
JOIN roles r ON r.role_id=ur.role_id
WHERE r.system_key=\"super_admin\"
GROUP BY u.user_id;
'" 2>/dev/null)"
[[ "$SUPER_ADMIN_ID" =~ ^[0-9]+$ ]] || fail "Could not identify exactly one Super Admin in temporary purge database."

docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB -e '
DELETE FROM user_permission_overrides WHERE user_id <> $SUPER_ADMIN_ID;
DELETE FROM user_roles WHERE user_id <> $SUPER_ADMIN_ID;
DELETE FROM users WHERE user_id <> $SUPER_ADMIN_ID;
'" 2>/dev/null

PURGED_USERS="$(docker compose exec -T mysql sh -lc "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB -e 'SELECT COUNT(*) FROM users;'" 2>/dev/null)"
PURGED_UNITS="$(docker compose exec -T mysql sh -lc "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB -e 'SELECT COUNT(*) FROM units;'" 2>/dev/null)"
PURGED_LOTS="$(docker compose exec -T mysql sh -lc "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB -e 'SELECT COUNT(*) FROM lots;'" 2>/dev/null)"
[[ "$PURGED_USERS" == "1" && "$PURGED_UNITS" == "0" && "$PURGED_LOTS" == "0" ]] || fail "Purge validation failed: users=$PURGED_USERS units=$PURGED_UNITS lots=$PURGED_LOTS"

docker compose exec -T mysql sh -lc "mysqldump --no-tablespaces --single-transaction --quick --routines --triggers --events --hex-blob --set-gtid-purged=OFF -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $PURGE_DB" > "$PURGE_ROOT/database/bwtdallas-purged.sql" 2>/dev/null
[[ -s "$PURGE_ROOT/database/bwtdallas-purged.sql" ]] || fail "Purged database dump is empty."
docker compose exec -T mysql sh -lc "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e 'DROP DATABASE $PURGE_DB;'" >/dev/null 2>&1

printf '6/8 Building portable development package...\n'
cp "$COMMON/application-dev.tar.gz" "$PURGE_ROOT/application/application.tar.gz"
cp "$APP_DIR/backup/scripts/"*.sh "$APP_DIR/backup/scripts/README.txt" "$PURGE_ROOT/backup-tools/"
cp "$APP_DIR/backup/scripts/systemd/"* "$PURGE_ROOT/backup-tools/systemd/"
ln "$COMMON/app-image.tar" "$PURGE_ROOT/docker/app-image.tar"
cat > "$PURGE_ROOT/development/.env.development.example" <<'EOF'
NODE_ENV=development
PORT=3000
BASE_URL=http://127.0.0.1:3000
DB_HOST=mysql
DB_PORT=3306
DB_NAME=bwtdallas_dev
DB_USER=bwtdallas
DB_PASSWORD=CHANGE_ME
DB_ROOT_PASSWORD=CHANGE_ME
SESSION_SECRET=CHANGE_ME
SCANTOOLS_API_SECRET=CHANGE_ME
TECHTOOLS_API_SECRET=CHANGE_ME
BWT_API_SESSION_HOURS=8
PASSWORD_SETUP_EXPIRES_HOURS=24
CONFIG_USAGE_RANKING_REFRESH_MINUTES=60
EOF
cat > "$PURGE_ROOT/development/docker-compose.development.yml" <<'EOF'
services:
  app:
    environment:
      NODE_ENV: development
    ports:
      - "127.0.0.1:3000:3000"
    labels:
      - "traefik.enable=false"
  phpmyadmin:
    environment:
      PMA_ABSOLUTE_URI: http://127.0.0.1:8081/
    ports:
      - "127.0.0.1:8081:80"
    labels:
      - "traefik.enable=false"
EOF
{
  printf 'Created: %s\n' "$(date --iso-8601=seconds)"
  printf 'Source host: %s\n' "$(hostname)"
  printf 'Retained users: 1 (Super Admin only)\n'
  printf 'Units: 0\n'
  printf 'Lots: 0\n'
  printf 'Production secrets included: no\n'
} > "$PURGE_ROOT/manifest/purge-summary.txt"
cat > "$PURGE_ROOT/README.txt" <<'EOF'
BWTDallas sanitized baseline / development bootstrap.
Production .env is intentionally excluded. Global configuration, roles/permissions, catalogs,
model/processor configuration, label templates/assets and the single Super Admin account are retained.
Operational Lots, Units, QC, requests, tool activity, sessions, print history, printers and user activity
are removed. Supply development secrets before starting the stack.
EOF

printf '7/8 Generating manifests and validating archives...\n'
for root in "$FULL_ROOT" "$PURGE_ROOT"; do
  (
    cd "$root"
    find . -type f ! -path './manifest/SHA256SUMS' -print0 | sort -z | xargs -0 sha256sum > manifest/SHA256SUMS
    sha256sum -c manifest/SHA256SUMS >/dev/null
  )
done

FULL_ZIP="$BACKUP_DIR/$FULL_NAME.zip"
PURGE_ZIP="$BACKUP_DIR/$PURGE_NAME.zip"
(
  cd "$WORK_DIR"
  zip -qr "$FULL_ZIP" "$FULL_NAME"
  zip -qr "$PURGE_ZIP" "$PURGE_NAME"
)
unzip -tq "$FULL_ZIP" >/dev/null
unzip -tq "$PURGE_ZIP" >/dev/null
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$FULL_ZIP")" > "$(basename "$FULL_ZIP").sha256"
  sha256sum "$(basename "$PURGE_ZIP")" > "$(basename "$PURGE_ZIP").sha256"
)

printf '8/8 Applying local retention policy (keep newest %s of each archive type)...\n' "$KEEP_BACKUPS"
mapfile -t old_full < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'Backup-*.zip' -printf '%T@ %p\n' | sort -nr | awk -v keep="$KEEP_BACKUPS" 'NR>keep {sub(/^[^ ]+ /,""); print}')
for archive in "${old_full[@]:-}"; do
  [[ -n "$archive" ]] || continue
  rm -f "$archive" "$archive.sha256"
done
mapfile -t old_purge < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'Purge-*.zip' -printf '%T@ %p\n' | sort -nr | awk -v keep="$KEEP_BACKUPS" 'NR>keep {sub(/^[^ ]+ /,""); print}')
for archive in "${old_purge[@]:-}"; do
  [[ -n "$archive" ]] || continue
  rm -f "$archive" "$archive.sha256"
done

printf '\nBackup completed successfully.\n'
printf 'Full:  %s\n' "$FULL_ZIP"
printf 'Purge: %s\n' "$PURGE_ZIP"
printf 'Checksums: %s.sha256 and %s.sha256\n' "$FULL_ZIP" "$PURGE_ZIP"
