'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
Module._load = originalModuleLoad;

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createResponseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    sentBody: undefined,
    renderedView: '',
    renderedLocals: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(body) {
      this.sentBody = body;
      return this;
    },
    render(view, locals) {
      this.renderedView = view;
      this.renderedLocals = locals;
      return this;
    }
  };
}

async function withQcModelStubs(callback) {
  const originals = {
    getTechUnitLifecycleSummaryById: techUnitModel.getTechUnitLifecycleSummaryById,
    getLatestWorkCompletionMapForUnits: techUnitModel.getLatestWorkCompletionMapForUnits,
    getLatestQcCheckForCompletion: unitQcCheckModel.getLatestQcCheckForCompletion,
    recordQcReview: unitQcCheckModel.recordQcReview
  };

  const recorded = [];
  techUnitModel.getTechUnitLifecycleSummaryById = async (unitId) => ({
    unitId: Number(unitId),
    assetTag: 'BWT12345',
    assignedToName: 'Test Technician',
    isParked: false
  });
  techUnitModel.getLatestWorkCompletionMapForUnits = async (unitIds) => new Map([
    [Number(unitIds[0]), { unitWorkCompletionId: 501 }]
  ]);
  unitQcCheckModel.getLatestQcCheckForCompletion = async () => null;
  unitQcCheckModel.recordQcReview = async (payload) => {
    recorded.push(payload);
    return payload;
  };

  try {
    await callback(recorded);
  } finally {
    Object.assign(techUnitModel, {
      getTechUnitLifecycleSummaryById: originals.getTechUnitLifecycleSummaryById,
      getLatestWorkCompletionMapForUnits: originals.getLatestWorkCompletionMapForUnits
    });
    Object.assign(unitQcCheckModel, {
      getLatestQcCheckForCompletion: originals.getLatestQcCheckForCompletion,
      recordQcReview: originals.recordQcReview
    });
  }
}

test('Accept and Reject submissions execute the QC controller and emit refresh events', async () => {
  await withQcModelStubs(async (recorded) => {
    for (const decisionCode of ['accepted', 'rejected']) {
      const req = {
        params: { unitId: '77' },
        body: {
          decisionCode,
          reviewNotes: decisionCode === 'rejected' ? 'Replace the damaged keyboard.' : ''
        },
        currentUser: { user_id: 19 },
        get: () => 'true'
      };
      const res = createResponseRecorder();
      let nextError = null;

      await techController.recordQcReview(req, res, (error) => {
        nextError = error;
      });

      assert.equal(nextError, null);
      assert.equal(res.statusCode, 200);
      assert.equal(res.sentBody, '');
      assert.deepEqual(JSON.parse(res.headers['HX-Trigger']), {
        'unit-saved': true,
        'qc-review-recorded': true
      });
    }

    assert.deepEqual(recorded.map((entry) => entry.decisionCode), ['accepted', 'rejected']);
    assert.equal(recorded[0].unitId, 77);
    assert.equal(recorded[0].unitWorkCompletionId, 501);
    assert.equal(recorded[0].reviewedByUserId, 19);
    assert.equal(recorded[1].reviewNotes, 'Replace the damaged keyboard.');
  });
});

test('Reject still returns an inline modal validation error when its reason is blank', async () => {
  await withQcModelStubs(async (recorded) => {
    const req = {
      params: { unitId: '77' },
      body: { decisionCode: 'rejected', reviewNotes: '   ' },
      currentUser: { user_id: 19 },
      get: () => 'true'
    };
    const res = createResponseRecorder();

    await techController.recordQcReview(req, res, () => {});

    assert.equal(recorded.length, 0);
    assert.equal(res.statusCode, 400);
    assert.equal(res.renderedView, 'fragments/tech-unit-qc-review-modal');
    assert.match(res.renderedLocals.errorMessages.join(' '), /rejection reason is required/i);
  });
});

test('unexpected save failures return a visible QC modal instead of disappearing into a generic error response', async () => {
  await withQcModelStubs(async () => {
    unitQcCheckModel.recordQcReview = async () => {
      throw new Error('simulated database failure');
    };

    const req = {
      params: { unitId: '77' },
      body: { decisionCode: 'accepted', reviewNotes: '' },
      currentUser: { user_id: 19 },
      get: () => 'true'
    };
    const res = createResponseRecorder();
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await techController.recordQcReview(req, res, () => {});
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(res.statusCode, 500);
    assert.equal(res.renderedView, 'fragments/tech-unit-qc-review-modal');
    assert.match(res.renderedLocals.errorMessages.join(' '), /could not be saved/i);
  });
});

test('QC modal uses the dedicated delegated submit transport and cache-busted browser script', () => {
  const modal = read('views/fragments/tech-unit-qc-review-modal.ejs');
  const script = read('public/js/tech-units.js');
  const browserPage = read('views/pages/tech-units.ejs');
  const detailPage = read('views/pages/tech-unit-detail.ejs');

  assert.match(modal, /data-qc-review-form/);
  assert.doesNotMatch(modal, /hx-post=.*qc-review/);
  assert.match(script, /addEventListener\('submit'/);
  assert.match(script, /closest\('\[data-qc-review-form\], \[data-qc-correction-form\], \[data-qc-reversion-form\], \[data-qc-reversion-request-form\]'/);
  assert.match(script, /await fetch\(form\.action/);
  assert.match(script, /'HX-Request': 'true'/);
  assert.match(script, /if \(!response\.ok\)/);
  assert.match(script, /replaceQcReviewModal\(responseMarkup\)/);
  assert.match(script, /dispatchHxTriggerHeader/);
  assert.match(browserPage, /tech-units\.js\?v=20260826-stage10w73c-browser-refinement/);
  assert.match(detailPage, /tech-units\.js\?v=20260826-stage10w73c-browser-refinement/);
});
