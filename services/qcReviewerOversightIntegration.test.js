'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getPermissionDefinition } = require('../config/permissionCatalog');
const { buildManagementQcReport } = require('./qcReportingService');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function review(overrides = {}) {
  return {
    technician_user_id: 7,
    technician_first_name: 'Tech',
    technician_last_name: 'One',
    unit_work_completion_id: 100,
    unit_id: 200,
    completed_at: '2026-10-01T10:00:00Z',
    unit_qc_check_id: 300,
    decision_code: 'accepted',
    reviewed_at: '2026-10-01T10:30:00Z',
    reviewer_user_id: 10,
    reviewer_first_name: 'QC',
    reviewer_last_name: 'Reviewer',
    reviewer_audit_outcome: null,
    reviewer_audited_at: null,
    reviewer_audited_by_user_id: null,
    has_correction_submission: 0,
    ...overrides
  };
}

test('QC reviewer oversight has separate view and perform permissions', () => {
  const view = getPermissionDefinition('qc.team_oversight.view');
  const perform = getPermissionDefinition('qc.reviewer_audit.perform');
  assert.ok(view);
  assert.ok(perform);
  assert.match(view.description, /audit coverage, agreement, and exception/i);
  assert.match(perform.description, /does not change the original QC decision/i);
});

test('QC reviewer audit migration creates immutable one-audit-per-decision storage and seeds protected defaults', () => {
  const migration = read('scripts/migrateQcReviewerOversight.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS qc_reviewer_audits/);
  assert.match(migration, /UNIQUE KEY uq_qc_reviewer_audits_check \(unit_qc_check_id\)/);
  assert.match(migration, /DEFAULT_ROLE_CODES = Object\.freeze\(\['admin', 'super_admin'\]\)/);
  assert.match(migration, /qc\.team_oversight\.view/);
  assert.match(migration, /qc\.reviewer_audit\.perform/);
});

test('QC reviewer audit routes require reporting plus the audit permission', () => {
  const routes = read('routes/management.js');
  const getBlock = routes.match(/router\.get\(\s*'\/management\/qc-reporting\/reviews\/:qcCheckId\/audit\/modal'[\s\S]*?\n\);/)?.[0] || '';
  const postBlock = routes.match(/router\.post\(\s*'\/management\/qc-reporting\/reviews\/:qcCheckId\/audit'[\s\S]*?\n\);/)?.[0] || '';
  for (const block of [getBlock, postBlock]) {
    assert.match(block, /requirePermission\('qc\.reporting\.view'\)/);
    assert.match(block, /requirePermission\('qc\.reviewer_audit\.perform'\)/);
  }
});

test('QC reviewer audit model blocks self-audit, requires discrepancy notes, and preserves Unit audit history', () => {
  const model = read('models/qcReviewerAuditModel.js');
  assert.match(model, /A QC reviewer cannot audit their own QC decision/);
  assert.match(model, /Explain the QC discrepancy/);
  assert.match(model, /unit_qc_reviewer_audited/);
  assert.match(model, /unitAuditEventModel\.insertEventWithConnection/);
  assert.match(model, /This QC decision has already been audited/);
});

test('reviewer oversight metrics calculate coverage, agreement, exceptions, turnaround, and a sample candidate', () => {
  const report = buildManagementQcReport([
    review({ reviewer_audit_outcome: 'agree', reviewer_audited_at: '2026-10-01T13:00:00Z' }),
    review({
      unit_work_completion_id: 101,
      unit_id: 201,
      unit_qc_check_id: 301,
      completed_at: '2026-10-01T11:00:00Z',
      reviewed_at: '2026-10-01T12:00:00Z',
      decision_code: 'rejected',
      reviewer_audit_outcome: 'missed_defect',
      reviewer_audited_at: '2026-10-01T13:10:00Z'
    }),
    review({
      unit_work_completion_id: 102,
      unit_id: 202,
      unit_qc_check_id: 302,
      completed_at: '2026-10-01T13:00:00Z',
      reviewed_at: '2026-10-01T14:30:00Z'
    })
  ]);
  const reviewer = report.reviewerActivity[0];
  assert.equal(reviewer.reviews, 3);
  assert.equal(reviewer.auditedReviews, 2);
  assert.equal(reviewer.auditAgreements, 1);
  assert.equal(reviewer.missedDefects, 1);
  assert.equal(reviewer.falseRejections, 0);
  assert.equal(reviewer.auditAgreementRate, 50);
  assert.equal(reviewer.auditCoverageRate, 66.7);
  assert.equal(reviewer.medianReviewMinutes, 60);
  assert.equal(reviewer.auditSampleQcCheckId, 302);
  assert.equal(report.reviewerOversight.auditedReviews, 2);
  assert.equal(report.reviewerOversight.auditCoverageRate, 66.7);
});

test('QC Reporting exposes oversight metrics and an independent spot-check modal', () => {
  const page = read('views/pages/management-qc-reporting.ejs');
  const modal = read('views/fragments/qc-reviewer-audit-modal.ejs');
  assert.match(page, /QC Reviewer Audit Agreement/);
  assert.match(page, /Audit Sample/);
  assert.match(page, /Median Review Time/);
  assert.match(page, /canViewQcTeamOversight/);
  assert.match(page, /canPerformQcReviewerAudit/);
  assert.match(modal, /QC Missed Defect/);
  assert.match(modal, /QC False Rejection/);
  assert.match(modal, /Open Unit in New Tab/);
});
