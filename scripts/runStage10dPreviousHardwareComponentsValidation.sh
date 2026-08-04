#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  config/unitFormFieldRegistry.test.js \
  services/lotUnitFormProfileResolver.test.js \
  services/unitFormSubmissionPolicy.test.js \
  services/unitAuditSnapshot.test.js \
  services/unitFormPersistenceGuard.test.js \
  services/unitFormFieldBindingValidator.test.js \
  services/memoryModuleComparisonEditor.test.js \
  services/stage10dPreviousHardwareComponentsIntegration.test.js

node scripts/validateStage10dPreviousHardwareComponents.js
