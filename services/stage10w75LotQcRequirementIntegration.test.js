'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Lot QC migration defaults every existing Lot to QC required', () => {
  const migration = read('scripts/migrateLotQcRequirement.js');

  assert.match(migration, /ADD COLUMN qc_required TINYINT\(1\) NOT NULL DEFAULT 1/);
  assert.match(migration, /CHECK \(qc_required IN \(0, 1\)\)/);
  assert.match(migration, /all existing Lots -> QC required/);
});

test('Lot create edit detail and duplication preserve the direct QC setting', () => {
  const lotModel = read('models/lotModel.js');
  const lotController = read('controllers/lotController.js');
  const lotForm = read('views/fragments/lot-form-modal.ejs');
  const lotDetail = read('views/pages/management-lot-detail.ejs');

  assert.match(lotModel, /hasQcRequired/);
  assert.match(lotModel, /qc_required/);
  assert.match(lotModel, /qcRequired: Number\(sourceLot\.qc_required \?\? 1\) === 1 \? '1' : '0'/);
  assert.match(lotController, /qcRequired: '1'/);
  assert.match(lotForm, /Require Quality Control \(QC\) for Units in this Lot/);
  assert.match(lotDetail, /Quality Control/);
});

test('QC-disabled Lots are excluded from QC Review while remaining visible in the Unit Browser', () => {
  const techController = read('controllers/techController.js');
  const techUnitModel = read('models/techUnitModel.js');
  const queue = read('services/qcReviewQueue.js');

  assert.match(techController, /qcRequiredOnly: true/);
  assert.match(techUnitModel, /COALESCE\(qc_lot\.qc_required, 1\)/);
  assert.match(techUnitModel, /qc_is_required/);
  assert.match(techUnitModel, /qcRequired: Number\(row\.qc_is_required\) !== 0/);
  assert.match(queue, /code: 'not_required'/);
  assert.match(queue, /QC not required for this Lot/);
});

test('QC writes and reversion paths enforce current Lot QC eligibility server-side', () => {
  const qcCheck = read('models/unitQcCheckModel.js');
  const qcCorrection = read('models/unitQcCorrectionModel.js');
  const techController = read('controllers/techController.js');

  assert.match(qcCheck, /lotQcRequirementModel\.assertUnitQcRequired/);
  assert.match(qcCorrection, /lotQcRequirementModel\.assertUnitQcRequired/);
  assert.match(techController, /BWT_QC_NOT_REQUIRED/);
  assert.match(techController, /context\.qcRequired/);
});

test('Unit History records Lot QC eligibility changes without rewriting QC checks', () => {
  const model = read('models/lotQcRequirementModel.js');
  const lotModel = read('models/lotModel.js');
  const cycleModel = read('models/productionCycleModel.js');
  const techUnitModel = read('models/techUnitModel.js');

  assert.match(model, /unit_qc_not_required/);
  assert.match(model, /unit_qc_required/);
  assert.match(model, /Quality Control not required for this completion cycle/);
  assert.match(lotModel, /auditLotQcRequirementChange/);
  assert.match(cycleModel, /auditUnitEnteredLot/);
  assert.match(techUnitModel, /auditCompletionIfNotRequired/);
});

test('QC icons use active blue pending and neutral not-required palettes', () => {
  const icon = read('views/fragments/tech-unit-qc-status-icon.ejs');
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/app.css');

  assert.match(icon, /'not-required'/);
  assert.match(icon, /'pending'/);
  assert.match(icon, /M7\.5 14\.5 14\.5 7\.5/);
  assert.match(table, /tech-qc-tooltip--not-required/);
  assert.match(table, /tech-qc-tooltip--pending/);
  assert.match(css, /--qc-pending-ink: #2563eb/);
  assert.match(css, /--qc-pending-background: #e8f0ff/);
  assert.match(css, /\.tech-qc-status-indicator--not-required \{[\s\S]*?opacity: 0\.68;/);
});

test('historical QC reporting remains based on recorded QC checks rather than current Lot requirement', () => {
  const reportingModel = read('models/qcReportingModel.js');
  assert.doesNotMatch(reportingModel, /qc_required/);
});
