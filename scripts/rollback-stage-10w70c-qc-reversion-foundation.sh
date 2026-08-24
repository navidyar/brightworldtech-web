#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh < sql/2026-08-stage-10w70c-qc-reversion-foundation-rollback.sql
printf '%s\n' 'Stage 10W70C database rollback completed.'
