'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC grading and Management reporting use one shared technician attribution contract', () => {
  const gradingModel = read('models/qcGradingModel.js');
  const reportingModel = read('models/qcReportingModel.js');
  const attributionModel = read('models/qcTechnicianAttributionModel.js');
  const attributionService = read('services/qcTechnicianAttribution.js');

  assert.match(gradingModel, /buildQcTechnicianAttributionSql/);
  assert.match(gradingModel, /getQcTechnicianAttributionCapabilities/);
  assert.match(gradingModel, /\$\{technicianAttribution\.expression\} AS technician_user_id/);
  assert.match(gradingModel, /whereParts\.push\(`\$\{technicianAttribution\.expression\} IN/);

  assert.match(reportingModel, /buildQcTechnicianAttributionSql/);
  assert.match(reportingModel, /getQcTechnicianAttributionCapabilities/);
  assert.match(reportingModel, /\$\{technicianAttribution\.expression\} AS technician_user_id/);
  assert.match(reportingModel, /technician\.user_id = \$\{technicianAttribution\.expression\}/);

  assert.match(attributionModel, /unit_assignment_history/);
  assert.match(attributionService, /assignment_lookup\.changed_at <= \$\{safeQcAlias\}\.reviewed_at/);
  assert.match(attributionService, /COALESCE\(\$\{safeUnitAlias\}\.assigned_to_user_id, \$\{safeCompletionAlias\}\.completed_by_user_id\)/);
});

test('QC attribution does not silently equate the completion-recording actor with the responsible technician', () => {
  const gradingModel = read('models/qcGradingModel.js');
  const reportingModel = read('models/qcReportingModel.js');

  assert.doesNotMatch(gradingModel, /completion\.completed_by_user_id AS technician_user_id/);
  assert.doesNotMatch(reportingModel, /completion\.completed_by_user_id AS technician_user_id/);
  assert.doesNotMatch(reportingModel, /technician\.user_id = completion\.completed_by_user_id/);
});

test('QC attribution validation command is registered and included in reporting validation', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['validate:qc-attribution'],
    'bash scripts/runStage9hQcTechnicianAttributionValidation.sh'
  );
  assert.match(packageJson.scripts['validate:qc-reporting'], /stage9hQcTechnicianAttributionConsistency\.test\.js/);

  const validator = read('scripts/validateStage9hQcTechnicianAttribution.js');
  assert.match(validator, /assignment_attributed_actions/);
  assert.match(validator, /Unit responsibility instead of completion recorder/);
});
