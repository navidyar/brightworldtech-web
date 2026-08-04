#!/usr/bin/env bash
set -euo pipefail

node --test \
  services/unitExportService.test.js \
  services/unitExportFileService.test.js \
  services/stage10aUnitExportFoundationIntegration.test.js \
  services/stage10aUnitExportFoundationCorrections.test.js \
  services/stage10bUnitExportFilesIntegration.test.js \
  services/stage10bUnitExportColumnSelectionIntegration.test.js
