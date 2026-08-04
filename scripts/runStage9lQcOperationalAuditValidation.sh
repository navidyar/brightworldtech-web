#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node --test \
  services/qc*.test.js \
  services/stage9*.test.js \
  services/unitBrowserRealtime.test.js

node scripts/validateStage9lQcOperationalAudit.js
