'use strict';

const { getQcOperationalAudit } = require('../models/qcOperationalAuditModel');
const { pool } = require('../models/db');

function formatList(values = [], limit = 8) {
  const safeValues = Array.isArray(values) ? values : [];
  const visible = safeValues.slice(0, limit);
  const suffix = safeValues.length > limit ? `, and ${safeValues.length - limit} more` : '';
  return `${visible.join(', ')}${suffix}`;
}

async function main() {
  const result = await getQcOperationalAudit();
  const { audit, integrity, history, sequences } = result;

  if (!audit.passed) {
    console.error('Stage 9L Quality Control operational audit failed.');
    audit.blockers.forEach((message) => console.error(`- ${message}`));

    if (sequences?.affectedCompletionIds?.recheckWithoutCorrection?.length) {
      console.error(`  Completion IDs with rechecks lacking correction: ${formatList(sequences.affectedCompletionIds.recheckWithoutCorrection)}`);
    }
    if (sequences?.affectedCompletionIds?.correctionAfterRecheck?.length) {
      console.error(`  Completion IDs with late correction handoffs: ${formatList(sequences.affectedCompletionIds.correctionAfterRecheck)}`);
    }
    if (Number(history?.missingReviewAuditEvents || 0) > 0) {
      console.error(`  Missing QC review history events: ${history.missingReviewAuditEvents}`);
    }
    if (Number(history?.missingCorrectionAuditEvents || 0) > 0) {
      console.error(`  Missing correction history events: ${history.missingCorrectionAuditEvents}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log('Stage 9L Quality Control operational audit passed.');
  console.log(`- Reviews: ${audit.metrics.reviews}`);
  console.log(`- Corrections: ${audit.metrics.corrections}`);
  console.log(`- Reviewed completion cycles: ${audit.metrics.completionCycles}`);
  console.log(`- Reviewed technicians: ${audit.metrics.reviewedTechnicians}`);
  console.log(`- Review actions reconciled to reporting: ${audit.metrics.reviewActions}`);
  console.log(`- Reviews retained on reversed completion cycles: ${audit.metrics.reversedCompletionReviews}`);

  audit.warnings.forEach((message) => console.warn(`Warning: ${message}`));
  if (sequences?.affectedCompletionIds?.acceptedThenReviewed?.length) {
    console.warn(`Historical accepted-then-reviewed completion IDs: ${formatList(sequences.affectedCompletionIds.acceptedThenReviewed)}`);
  }
  if (sequences?.affectedCompletionIds?.timestampRegression?.length) {
    console.warn(`Completion IDs with review timestamp ordering warnings: ${formatList(sequences.affectedCompletionIds.timestampRegression)}`);
  }

  if (Number(integrity?.reversedCompletionReviews || 0) > 0) {
    console.log('Reversed completion reviews remain available in Unit History and are excluded from active grading and reporting.');
  }
}

main()
  .catch((error) => {
    console.error('Stage 9L Quality Control operational audit could not be completed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  });
