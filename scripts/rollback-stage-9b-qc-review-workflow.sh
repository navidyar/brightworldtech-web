#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh \
  < sql/2026-07-stage-9b-qc-review-workflow-rollback.sql

printf '%s\n' 'Stage 9B Quality Control review workflow rollback complete.'
