#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/qcTechnicianAttributionModel.test.js \
  services/stage9hQcTechnicianAttributionConsistency.test.js

node scripts/validateStage9hQcTechnicianAttribution.js
