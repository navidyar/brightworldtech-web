#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node --test \
  services/componentDetailPreservation.test.js \
  services/stage10tStabilizationCleanupIntegration.test.js \
  services/sharedCssFoundationValidator.test.js \
  services/memoryModuleComparisonEditor.test.js \
  services/stage10lOutcomeRequestAndIssueControlsIntegration.test.js \
  services/stage10mOperationalOptionRankingIntegration.test.js \
  services/stage10sConfigurationPointerFilteredDragIntegration.test.js \
  services/stage10vUnitDetailsHistoryComponentsIntegration.test.js \
  services/stage10v7OutcomeRequestNoteVisibilityIntegration.test.js

node scripts/validateSharedCssFoundation.js
node scripts/validateStage10tSourceCleanup.js
node scripts/checkStage10tComponentDetailData.js
node scripts/validateStage10mOperationalOptionRankings.js

echo 'Stage 10T stabilization health check complete.'
