'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const dbPath = require.resolve('../models/db');
const auditPath = require.resolve('./unitWorkflowAudit');
const outcomeModelPath = require.resolve('../models/unitOutcomeModel');

function loadOutcomeModel() {
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: {} }
  };
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: {}
  };
  delete require.cache[outcomeModelPath];
  return require('../models/unitOutcomeModel');
}

function createConnection(results) {
  const queue = [...results];
  const calls = [];

  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (queue.length === 0) {
        throw new Error(`Unexpected query: ${sql}`);
      }
      return queue.shift();
    }
  };
}

test('approval request checkbox and note are action-only form controls', () => {
  const model = read('models/unitOutcomeModel.js');
  const markup = read('views/fragments/tech-unit-form.ejs');
  const client = read('public/js/tech-unit-form.js');

  assert.match(model, /Approval requests are one-time actions/);
  assert.match(model, /outcomeApprovalRequested:\s*false/);
  assert.match(model, /outcomeApprovalRequestNotes:\s*''/);
  assert.match(markup, /data-outcome-approval-request-toggle/);
  assert.match(markup, /data-outcome-approval-request-notes/);
  assert.match(markup, /disabled aria-disabled="true"/);
  assert.match(client, /function updateOutcomeApprovalRequestControls/);
  assert.match(client, /notes\.disabled = !requestActive/);
  assert.match(client, /notes\.value = ''/);
  assert.match(client, /data-outcome-approval-request-toggle/);
});

test('an unchanged save without a new request preserves an existing pending outcome request', async () => {
  const model = loadOutcomeModel();
  const connection = createConnection([
    [[{ table_exists: 1 }]],
    [[{
      unit_outcome_id: 5,
      outcome_code: 'pass',
      outcome_notes: 'Ready',
      approval_status_code: 'pending',
      approval_requested_by_user_id: 4,
      approval_request_notes: 'Please review'
    }]]
  ]);

  const result = await model.saveOutcomeForUnitWithConnection(connection, {
    unitId: 12,
    currentUserId: 9,
    formData: {
      outcomeCode: 'pass',
      outcomeNotes: 'Ready',
      outcomeApprovalRequested: false,
      outcomeApprovalRequestNotes: ''
    }
  });

  assert.deepEqual(result, {
    saved: false,
    unitOutcomeId: 5,
    outcomeChanged: false,
    approvalRequested: false
  });
  assert.equal(connection.calls.length, 2);
  assert.equal(connection.calls.some((call) => /UPDATE unit_outcomes/.test(call.sql)), false);
  assert.equal(connection.calls.some((call) => /INSERT INTO unit_outcomes/.test(call.sql)), false);
});


test('outcome persistence ignores a crafted confirmation action unless the caller grants regular-Tech authority', async () => {
  const model = loadOutcomeModel();
  const connection = createConnection([
    [[{ table_exists: 1 }]],
    [[{
      unit_outcome_id: 5,
      outcome_code: 'pass',
      outcome_notes: 'Ready',
      approval_status_code: 'not_requested',
      approval_requested_by_user_id: null,
      approval_request_notes: null
    }]]
  ]);

  const result = await model.saveOutcomeForUnitWithConnection(connection, {
    unitId: 12,
    currentUserId: 9,
    formData: {
      outcomeCode: 'pass',
      outcomeNotes: 'Ready',
      outcomeApprovalRequested: true,
      outcomeApprovalRequestNotes: 'Crafted request'
    }
  });

  assert.deepEqual(result, {
    saved: false,
    unitOutcomeId: 5,
    outcomeChanged: false,
    approvalRequested: false
  });
  assert.equal(connection.calls.some((call) => /INSERT INTO unit_outcomes/.test(call.sql)), false);
});

test('another tech can submit a fresh request for the same unchanged outcome', async () => {
  const model = loadOutcomeModel();
  const connection = createConnection([
    [[{ table_exists: 1 }]],
    [[{
      unit_outcome_id: 5,
      outcome_code: 'pass',
      outcome_notes: 'Ready',
      approval_status_code: 'pending',
      approval_requested_by_user_id: 4,
      approval_request_notes: 'First review'
    }]],
    [{ affectedRows: 1 }],
    [{ insertId: 8 }]
  ]);

  const result = await model.saveOutcomeForUnitWithConnection(connection, {
    unitId: 12,
    currentUserId: 9,
    canRequestOutcomeConfirmation: true,
    formData: {
      outcomeCode: 'pass',
      outcomeNotes: 'Ready',
      outcomeApprovalRequested: true,
      outcomeApprovalRequestNotes: 'Second review'
    }
  });

  assert.equal(result.saved, true);
  assert.equal(result.outcomeChanged, false);
  assert.equal(result.approvalRequested, true);
  const insert = connection.calls.find((call) => /INSERT INTO unit_outcomes/.test(call.sql));
  assert.ok(insert);
  assert.equal(insert.values[4], 9);
  assert.equal(insert.values[5], 9);
  assert.equal(insert.values[7], 'Second review');
});

test('unrequested unchanged outcome saves do not withdraw pending Requests records', () => {
  const expanded = read('models/unitExpandedFormModel.js');

  assert.match(expanded, /const outcomeSaveResult = await unitOutcomeModel\.saveOutcomeForUnitWithConnection/);
  assert.match(expanded, /!approvalRequested && !outcomeSaveResult\?\.outcomeChanged/);
  assert.match(expanded, /approvalRequested\n\s*\}\);/);
});

test('Cosmetic and Hardware Add buttons sit inside their section headers', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');

  assert.match(markup, /tech-form-section--cosmetic-issues[\s\S]*?tech-repeatable-section-heading[\s\S]*?data-add-module-row="cosmeticIssue"[^>]*>\+ Add<\/button>[\s\S]*?data-module-list="cosmeticIssue"/);
  assert.match(markup, /tech-form-section--hardware-issues[\s\S]*?tech-repeatable-section-heading[\s\S]*?data-add-module-row="hardwareIssue"[^>]*>\+ Add<\/button>[\s\S]*?data-module-list="hardwareIssue"/);
  assert.doesNotMatch(markup, /tech-repeatable-list-toolbar/);
  assert.doesNotMatch(markup, />\+ Add Cosmetic Issue<\/button>/);
  assert.doesNotMatch(markup, />\+ Add Hardware Issue<\/button>/);
});

test('Add and Remove controls use compact low-saturation green and red treatments', () => {
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /button\.secondary-button\[data-add-module-row\][\s\S]*?min-height:\s*30px[\s\S]*?border:\s*1px solid #6f9f7c[\s\S]*?background:\s*#edf7f0/);
  assert.match(css, /button\.secondary-button\[data-remove-module-row\][\s\S]*?min-height:\s*30px[\s\S]*?background:\s*#fff2f2/);
  assert.match(css, /\.tech-repeatable-section-heading\s*\{/);
  assert.match(css, /\.tech-memory-edit-row > \.tech-memory-remove-button[\s\S]*?height:\s*39px/);
});

test('Unit form assets remain cache-busted on modal and full-page entry points', () => {
  const detailPage = read('views/pages/tech-unit-detail.ejs');
  const formPage = read('views/pages/tech-unit-form.ejs');
  const browserPage = read('views/pages/tech-units.ejs');

  [detailPage, formPage, browserPage].forEach((page) => {
    assert.match(page, /tech-units-clean\.css\?v=/);
    assert.match(page, /tech-(?:units|unit-form)\.js\?v=/);
  });
});
