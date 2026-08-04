'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('topbar renders the QC role as Quality Control', () => {
  assert.match(read('views/partials/topbar.ejs'), /currentRoles\.map\(formatRoleLabel\)/);
  assert.match(read('views/partials/helpers.js'), /qc: 'Quality Control'/);
});

test('only QC receives the accept and reject routes', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /const qcReviewRoles = \['qc'\]/);
  assert.match(routes, /qc-review\/:decisionCode\/modal[\s\S]*?requireRole\(qcReviewRoles\)/);
  assert.match(routes, /qc-review'[\s\S]*?requireRole\(qcReviewRoles\)/);
  assert.match(routes, /qc-review\/details\/modal[\s\S]*?requireRole\(unitBrowserRoles\)/);
});

test('QC review modal requires rejection notes and keeps acceptance notes optional', () => {
  const modal = read('views/fragments/tech-unit-qc-review-modal.ejs');
  const controller = read('controllers/techController.js');
  assert.match(modal, /isReject \? 'Reject Unit' : 'Accept Unit'/);
  assert.match(modal, /<%= isReject \? 'required' : '' %>/);
  assert.match(controller, /decisionCode === 'rejected' && !reviewNotes/);
});

test('unit table shows compact clickable QC indicators and QC-only review controls', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(table, /const canRecordQcReview = currentUserRoles\.includes\('qc'\)/);
  assert.match(table, /include\('tech-unit-qc-status-icon', \{ statusCode: unit\.qcReviewStateCode, decisionCode: latestQcReview\.decisionCode \}\)/);
  assert.match(read('views/fragments/tech-unit-qc-status-icon.ejs'), /tech-qc-status-indicator--<%= qcStatusCode %>/);
  assert.match(table, /qc-review\/details\/modal/);
  assert.match(table, /qc-review\/accepted\/modal/);
  assert.match(table, /qc-review\/rejected\/modal/);
  assert.match(table, /Awaiting completion/);
});

test('QC decisions are append-only and create Unit History audit events', () => {
  const model = read('models/unitQcCheckModel.js');
  assert.match(model, /INSERT INTO unit_qc_checks/);
  assert.match(model, /unit_work_completion_id/);
  assert.match(model, /unit_qc_accepted/);
  assert.match(model, /unit_qc_rejected/);
  assert.match(model, /Quality Control Notes/);
  assert.doesNotMatch(model, /UPDATE unit_qc_checks/);
});

test('Stage 9B migration creates constrained QC storage and full role label', () => {
  const migration = read('sql/2026-07-stage-9b-qc-review-workflow.sql');
  assert.match(migration, /name = 'Quality Control'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS unit_qc_checks/);
  assert.match(migration, /SELECT COLUMN_TYPE[\s\S]*?unit_work_completions[\s\S]*?unit_work_completion_id/);
  assert.match(migration, /unit_work_completion_id ', completion_id_type, ' NOT NULL/);
  assert.doesNotMatch(migration, /unit_work_completion_id BIGINT UNSIGNED NOT NULL/);
  assert.match(migration, /decision_code IN \(''accepted'', ''rejected''\)/);
  assert.match(migration, /rejection_notes/);
});
