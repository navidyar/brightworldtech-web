'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Stage 10W79J adds one authenticated ScanTools secure-wipe certificate endpoint', () => {
  const routes = read('routes/api.js');
  const controller = read('controllers/apiUnitController.js');
  assert.match(routes, /\/units\/:unitId\/wipe-certificates\/:certificateId/);
  assert.match(routes, /requireApiAuth[\s\S]*requireUnitApiAccess[\s\S]*recordWipeCertificate/);
  assert.match(controller, /apiWipeCertificate\.recordWipeCertificate/);
});

test('wipe evidence is ScanTools-only append-only and idempotent by certificate evidence hash', () => {
  const service = read('services/apiWipeCertificate.js');
  assert.match(service, /toolSource !== TOOL_SOURCES\.SCANTOOL/);
  assert.match(service, /WIPE_CERTIFICATE_SOURCE_NOT_ALLOWED/);
  assert.match(service, /buildEvidenceHash/);
  assert.match(service, /WIPE_CERTIFICATE_CONFLICT/);
  assert.doesNotMatch(service, /UPDATE unit_storage_wipe_certificates/);
});

test('wipe evidence links by storage serial and records one readable Unit History event', () => {
  const service = read('services/apiWipeCertificate.js');
  assert.match(service, /WHERE unit_id = \? AND serial_number = \?/);
  assert.match(service, /unitAuditEventModel\.insertEventWithConnection/);
  assert.match(service, /eventType: 'unit_secure_wipe_certificate_recorded'/);
  assert.match(service, /fieldLabel: 'Secure Wipe Certificate'/);
});

test('migration adds only the append-only secure-wipe evidence table', () => {
  const migration = read('scripts/migrateApiToolDetailsWipeEvidence.js');
  assert.match(migration, /CREATE TABLE \$\{TABLE_NAME\}/);
  assert.match(migration, /UNIQUE KEY uq_unit_storage_wipe_certificate_id \(certificate_id\)/);
  assert.match(migration, /No database changes were made/);
  assert.doesNotMatch(migration, /unit_production_cycles|credited_weight|production_cycle_key/);
});

test('Tool Details read model exposes selected backend-only specs storage graphics wipe evidence and recent runs', () => {
  const model = read('models/unitToolDetailsModel.js');
  for (const token of ['lte_imei', 'tpm_version', 'ac_adapter_wattage', 'storage_interface', 'gpu_vendor', 'unit_storage_wipe_certificates', 'unit_tool_runs']) {
    assert.match(model, new RegExp(token));
  }
  assert.doesNotMatch(model, /system_uuid/);
  assert.match(model, /LIMIT 10/);
});

test('browser Unit Details lazy-loads Tool-Observed Details instead of expanding the Units Browser query', () => {
  const routes = read('routes/management.js');
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(routes, /\/tech\/units\/:unitId\/tool-details/);
  assert.match(table, /hx-get="\/tech\/units\/<%= unit\.unitId %>\/tool-details"/);
  assert.match(table, /hx-trigger="revealed once"/);
});

test('Tool Details fragment presents backend-only evidence without adding editable form controls', () => {
  const fragment = read('views/fragments/tech-unit-tool-details.ejs');
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(fragment, /Tool Details/);
  assert.match(fragment, /LTE IMEI/);
  assert.match(fragment, /Secure-Wipe Evidence/);
  assert.match(fragment, /Recent Tool Runs/);
  assert.match(form, /name="systemUuid"/);
  assert.doesNotMatch(form, /name="lteImei"|name="acAdapterWattage"/);
});

test('Stage 10W79J remains isolated from Lot policy production cycles completion and weighting', () => {
  const service = read('services/apiWipeCertificate.js');
  const model = read('models/unitToolDetailsModel.js');
  const combined = `${service}\n${model}`;
  assert.doesNotMatch(combined, /production_cycle_key|grants_production_credit|credited_weight|start_new_production_cycle_on_move/);
  assert.doesNotMatch(combined, /UPDATE lots|INSERT INTO unit_work_completions/);
});
