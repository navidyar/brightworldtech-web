#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/qcReviewQueue.test.js \
  services/qcGradingService.test.js \
  services/stage9gQcCorrectionWorkflowIntegration.test.js \
  services/stage9gQcCorrectionSubmission.test.js

node scripts/validateStage9gQcCorrectionWorkflow.js
