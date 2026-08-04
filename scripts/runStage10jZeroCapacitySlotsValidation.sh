#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/hardwareCapacity.test.js \
  services/unitFormSubmissionPolicy.test.js \
  services/stage10iCapacitySelectionDefaultsIntegration.test.js \
  services/stage10jZeroCapacitySlotsIntegration.test.js \
  services/memoryModuleComparisonEditor.test.js \
  services/stage10cPreviousCurrentHardwareIntegration.test.js \
  services/stage10dPreviousHardwareComponentsIntegration.test.js

node scripts/validateStage10jZeroCapacitySlots.js
