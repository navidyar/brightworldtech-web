#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node --test \
  services/operationalOptionRankingAdministration.test.js \
  services/stage10wOperationalRankingAdministrationIntegration.test.js \
  services/stage10mOperationalOptionRankingIntegration.test.js \
  services/configurationOrderingPolicy.test.js

node scripts/validateStage10wOperationalRankingAdministration.js
