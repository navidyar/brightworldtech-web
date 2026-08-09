'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

process.env.DB_HOST ||= 'test-db';
process.env.DB_PORT ||= '3306';
process.env.DB_NAME ||= 'test';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';

const originalModuleLoad = Module._load;
Module._load = function loadWithMysqlStub(request, parent, isMain) {
  if (request === 'mysql2/promise') {
    return {
      createPool: () => ({
        query: async () => [[], []],
        getConnection: async () => ({
          beginTransaction: async () => {},
          commit: async () => {},
          rollback: async () => {},
          release: () => {},
          query: async () => [[], []]
        })
      })
    };
  }
  return originalModuleLoad(request, parent, isMain);
};

const techController = require('../controllers/techController');
const techUnitModel = require('../models/techUnitModel');
const unitQcCheckModel = require('../models/unitQcCheckModel');
const unitQcCorrectionModel = require('../models/unitQcCorrectionModel');
Module._load = originalModuleLoad;

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    renderedView: '',
    renderedLocals: null,
    sentBody: undefined,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    render(view, locals) { this.renderedView = view; this.renderedLocals = locals; return this; },
    send(body) { this.sentBody = body; return this; }
  };
}

async function withCorrectionStubs(callback, { assignedToUserId = 19, existingCorrection = null } = {}) {
  const originals = {
    lifecycle: techUnitModel.getTechUnitLifecycleSummaryById,
    completion: techUnitModel.getLatestWorkCompletionMapForUnits,
    reviewHistory: unitQcCheckModel.listQcChecksForCompletion,
    correctionHistory: unitQcCorrectionModel.listCorrectionsForCompletion,
    record: unitQcCorrectionModel.recordCorrectionSubmission
  };
  const recorded = [];

  techUnitModel.getTechUnitLifecycleSummaryById = async (unitId) => ({
    unitId: Number(unitId),
    assetTag: 'BWT9001',
    assignedToUserId,
    assignedToName: 'Test Technician',
    isParked: false
  });
  techUnitModel.getLatestWorkCompletionMapForUnits = async (unitIds) => new Map([
    [Number(unitIds[0]), { unitWorkCompletionId: 501 }]
  ]);
  unitQcCheckModel.listQcChecksForCompletion = async () => [{
    qcCheckId: 801,
    decisionCode: 'rejected',
    decisionLabel: 'Rejected',
    notes: 'Replace the damaged keyboard.'
  }];
  unitQcCorrectionModel.listCorrectionsForCompletion = async () => existingCorrection
    ? [{ ...existingCorrection, rejectedQcCheckId: 801 }]
    : [];
  unitQcCorrectionModel.recordCorrectionSubmission = async (payload) => {
    recorded.push(payload);
    return payload;
  };

  try {
    await callback(recorded);
  } finally {
    techUnitModel.getTechUnitLifecycleSummaryById = originals.lifecycle;
    techUnitModel.getLatestWorkCompletionMapForUnits = originals.completion;
    unitQcCheckModel.listQcChecksForCompletion = originals.reviewHistory;
    unitQcCorrectionModel.listCorrectionsForCompletion = originals.correctionHistory;
    unitQcCorrectionModel.recordCorrectionSubmission = originals.record;
  }
}

test('assigned technician can mark the current rejection corrected', async () => {
  await withCorrectionStubs(async (recorded) => {
    const req = {
      params: { unitId: '77' },
      body: { correctionNotes: 'Keyboard replaced and retested.' },
      currentUser: { user_id: 19, roles: ['tech'] }
    };
    const res = responseRecorder();

    await techController.submitQcCorrection(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentBody, '');
    assert.deepEqual(JSON.parse(res.headers['HX-Trigger']), {
      'unit-saved': true,
      'qc-correction-submitted': true
    });
    assert.deepEqual(recorded[0], {
      unitId: 77,
      unitWorkCompletionId: 501,
      rejectedQcCheckId: 801,
      submittedByUserId: 19,
      submittedByRoleCodes: ['tech'],
      correctionNotes: 'Keyboard replaced and retested.'
    });
  });
});

test('regular technician cannot mark another technician’s Unit corrected', async () => {
  await withCorrectionStubs(async (recorded) => {
    const req = {
      params: { unitId: '77' },
      body: { correctionNotes: '' },
      currentUser: { user_id: 19, roles: ['tech'] }
    };
    const res = responseRecorder();

    await techController.submitQcCorrection(req, res, () => {});

    assert.equal(recorded.length, 0);
    assert.equal(res.statusCode, 400);
    assert.match(res.renderedLocals.errorMessages.join(' '), /do not have permission/i);
  }, { assignedToUserId: 20 });
});

test('duplicate correction submission returns an inline workflow message', async () => {
  await withCorrectionStubs(async (recorded) => {
    const req = {
      params: { unitId: '77' },
      body: { correctionNotes: '' },
      currentUser: { user_id: 19, roles: ['tech'] }
    };
    const res = responseRecorder();

    await techController.submitQcCorrection(req, res, () => {});

    assert.equal(recorded.length, 0);
    assert.equal(res.statusCode, 400);
    assert.match(res.renderedLocals.errorMessages.join(' '), /already marked corrected/i);
  }, { existingCorrection: { qcCorrectionId: 901 } });
});
