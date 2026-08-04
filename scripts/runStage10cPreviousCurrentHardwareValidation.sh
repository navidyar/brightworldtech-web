#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  config/unitFormFieldRegistry.test.js \
  services/lotUnitFormProfileResolver.test.js \
  services/unitFormSubmissionPolicy.test.js \
  services/unitAuditSnapshot.test.js \
  services/unitExportService.test.js \
  services/unitExportFileService.test.js \
  services/stage10cPreviousCurrentHardwareIntegration.test.js

node scripts/validateStage10cPreviousCurrentHardware.js
