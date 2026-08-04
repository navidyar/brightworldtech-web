#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/unitExportService.test.js \
  services/stage10aUnitExportFoundationIntegration.test.js \
  services/stage10aUnitExportFoundationCorrections.test.js

node scripts/validateStage10aUnitExportFoundation.js
