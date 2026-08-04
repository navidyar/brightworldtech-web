'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const qcGradingModel = require('../models/qcGradingModel');
const {
  assertValidQcGradeSummary,
  calculateQcGradeSummariesByTechnician,
  calculateQcGradeSummary
} = require('../services/qcGradingService');

async function main() {
  const reviewActions = await qcGradingModel.listQcReviewActions({}, pool);
  const summaries = calculateQcGradeSummariesByTechnician(reviewActions);
  summaries.forEach(assertValidQcGradeSummary);

  const overall = calculateQcGradeSummary(reviewActions);
  assertValidQcGradeSummary(overall);

  const gradeText = overall.qualityGrade === null ? 'ungraded' : `${overall.qualityGrade}%`;
  console.log(
    `Stage 9D QC grading foundation valid: ${summaries.length} graded technician(s), `
    + `${overall.reviewedUnits} reviewed Unit(s), overall first-pass grade ${gradeText}.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(async () => pool.end());
