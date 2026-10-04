#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE="${1:-}"
[[ -n "$ARCHIVE" ]] || { echo "Usage: $0 /path/to/Backup-*.zip"; exit 2; }
[[ -f "$ARCHIVE" ]] || { echo "Archive not found: $ARCHIVE" >&2; exit 1; }

command -v unzip >/dev/null 2>&1 || { echo "unzip is required" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 1; }

SIDE_CAR="$ARCHIVE.sha256"
if [[ -f "$SIDE_CAR" ]]; then
  (
    cd "$(dirname "$ARCHIVE")"
    sha256sum -c "$(basename "$SIDE_CAR")"
  )
else
  echo "WARNING: no outer checksum sidecar found: $SIDE_CAR" >&2
fi

unzip -tq "$ARCHIVE" >/dev/null

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ARCHIVE" -d "$TMP"
ROOT_COUNT="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | wc -l)"
[[ "$ROOT_COUNT" == "1" ]] || { echo "Archive must contain exactly one top-level directory." >&2; exit 1; }
ROOT="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -print -quit)"
[[ -f "$ROOT/manifest/SHA256SUMS" ]] || { echo "Inner manifest missing." >&2; exit 1; }

(
  cd "$ROOT"
  sha256sum -c manifest/SHA256SUMS
)

if [[ -f "$ROOT/database/bwtdallas-full.sql" ]]; then
  DB_FILE="$ROOT/database/bwtdallas-full.sql"
elif [[ -f "$ROOT/database/bwtdallas-purged.sql" ]]; then
  DB_FILE="$ROOT/database/bwtdallas-purged.sql"
else
  echo "No recognized database dump found." >&2
  exit 1
fi

[[ -s "$DB_FILE" ]] || { echo "Database dump is empty." >&2; exit 1; }
[[ -s "$ROOT/application/application.tar.gz" ]] || { echo "Application archive missing or empty." >&2; exit 1; }
[[ -s "$ROOT/docker/app-image.tar" ]] || { echo "Application image archive missing or empty." >&2; exit 1; }

echo
echo "Archive verification passed: $ARCHIVE"
