'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildManagementQcReport,
  createEmptyManagementQcReport
} = require('./qcReportingService');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function review(overrides = {}) {
  return {
    technician_user_id: 1,
    technician_first_name: 'Alex',
    technician_last_name: 'Tech',
    technician_email: 'alex@example.com',
    unit_work_completion_id: 101,
    unit_id: 501,
    completed_at: '2026-07-01T12:00:00.000Z',
    unit_qc_check_id: 1,
    decision_code: 'rejected',
    review_notes: 'Screen scratch',
    reviewed_at: '2026-07-01T13:00:00.000Z',
    reviewer_user_id: 10,
    reviewer_first_name: 'Quinn',
    reviewer_last_name: 'Reviewer',
    reviewer_email: 'quinn@example.com',
    has_correction_submission: 0,
    ...overrides
  };
}

test('QC Reporting no longer renders the Rejection Patterns section', () => {
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.doesNotMatch(page, />Rejection Patterns</);
  assert.doesNotMatch(page, /report\.rejectionPatterns/);
  assert.doesNotMatch(page, />Rejection Note</);
  assert.match(page, />Technician Comparison</);
  assert.match(page, />Reviewer Activity</);
});

test('report generation no longer builds the rejected-note grouping payload', () => {
  const report = buildManagementQcReport([
    review(),
    review({
      unit_work_completion_id: 102,
      unit_qc_check_id: 2,
      review_notes: '  SCREEN   SCRATCH '
    })
  ]);

  assert.equal(Object.hasOwn(report, 'rejectionPatterns'), false);
  assert.equal(report.rejectionActions, 2);
  assert.equal(report.reviewerActivity[0].rejectedReviews, 2);
  assert.equal(Object.hasOwn(createEmptyManagementQcReport(), 'rejectionPatterns'), false);
});

test('removing Rejection Patterns does not remove underlying QC rejection-note storage', () => {
  const model = read('models/qcReportingModel.js');
  const qcModel = read('models/unitQcCheckModel.js');

  assert.match(model, /review_notes/);
  assert.match(qcModel, /review_notes/);
});
