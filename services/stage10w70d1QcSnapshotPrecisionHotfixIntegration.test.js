'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 10W70D1 snapshots QC review timestamp directly in MySQL to preserve DATETIME(6) precision', () => {
  const model = read('models/unitRequestModel.js');
  assert.match(model, /INSERT INTO unit_qc_reversion_requests[\s\S]*SELECT[\s\S]*qc\.reviewed_at[\s\S]*FROM unit_qc_checks qc/);
  assert.doesNotMatch(model, /state\.reviewed_at,[\s\S]*state\.review_notes/);
});

test('Stage 10W70D1 approval fails closed when any immutable QC snapshot field differs', () => {
  const model = read('models/unitRequestModel.js');
  assert.match(model, /qrr\.decision_code = qc\.decision_code/);
  assert.match(model, /qrr\.qc_reviewed_by_user_id = qc\.reviewed_by_user_id/);
  assert.match(model, /qrr\.qc_reviewed_at = qc\.reviewed_at/);
  assert.match(model, /qrr\.qc_review_notes <=> qc\.review_notes/);
  assert.match(model, /BWT_QC_REVERSION_REQUEST_SNAPSHOT_MISMATCH/);
});

test('Stage 10W70D1 integrity checks include timestamp and review-note fidelity', () => {
  for (const file of [
    'scripts/preflight-stage-10w70d-qc-reversion-requests.sh',
    'scripts/check-stage-10w70d-qc-reversion-requests.sh'
  ]) {
    const source = read(file);
    assert.match(source, /qrr\.qc_reviewed_at <> qc\.reviewed_at/);
    assert.match(source, /NOT \(qrr\.qc_review_notes <=> qc\.review_notes\)/);
  }
});

test('Stage 10W70D1 repair is limited to pending requests with otherwise exact immutable linkage', () => {
  const preflight = read('scripts/preflight-stage-10w70d1-qc-reversion-snapshot-precision.sh');
  const repair = read('scripts/repair-stage-10w70d1-qc-reversion-snapshot-precision.sh');

  assert.match(preflight, /ur\.status='pending'/);
  assert.match(preflight, /already-reviewed QC reversion snapshot mismatch/);
  assert.match(preflight, /No database changes were made/);
  assert.match(repair, /ur\.status='pending'/);
  assert.match(repair, /qrr\.unit_id = qc\.unit_id/);
  assert.match(repair, /qrr\.decision_code = qc\.decision_code/);
  assert.match(repair, /qrr\.qc_reviewed_by_user_id = qc\.reviewed_by_user_id/);
  assert.match(repair, /qrr\.qc_reviewed_at = qc\.reviewed_at/);
  assert.match(repair, /Stage 10W70D1 snapshot precision repair verified/);
});
