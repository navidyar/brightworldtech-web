#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/operationalOptionRanking.test.js \
  services/stage10mOperationalOptionRankingIntegration.test.js \
  services/stage10hUnitFormCategoryWeightCapacityIntegration.test.js \
  services/stage10iCapacitySelectionDefaultsIntegration.test.js \
  services/stage10kUnitFormErrorPlacementIntegration.test.js \
  services/stage10lOutcomeRequestAndIssueControlsIntegration.test.js

node scripts/validateStage10mOperationalOptionRankings.js
