'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { getQcReviewActionAvailability } = require('./qcReviewActionAvailability');

test('unreviewed completed Units keep both QC decisions available', () => {
  const state = getQcReviewActionAvailability({ hasCompletion: true });

  assert.equal(state.visible, true);
  assert.equal(state.acceptEnabled, true);
  assert.equal(state.rejectEnabled, true);
});

test('accepted Units keep both controls visible but disable the final cycle decisions', () => {
  const state = getQcReviewActionAvailability({
    hasCompletion: true,
    latestDecisionCode: 'accepted'
  });

  assert.equal(state.visible, true);
  assert.equal(state.acceptEnabled, false);
  assert.equal(state.rejectEnabled, false);
  assert.match(state.acceptDisabledReason, /already been accepted/i);
  assert.match(state.rejectDisabledReason, /final/i);
});

test('rejected Units disable repeated decisions until a correction is submitted', () => {
  const state = getQcReviewActionAvailability({
    hasCompletion: true,
    latestDecisionCode: 'rejected',
    hasCorrection: false
  });

  assert.equal(state.visible, true);
  assert.equal(state.acceptEnabled, false);
  assert.equal(state.rejectEnabled, false);
  assert.match(state.acceptDisabledReason, /mark this Unit corrected/i);
  assert.match(state.rejectDisabledReason, /already been rejected/i);
});

test('corrected rejected Units re-enable both decisions for QC recheck', () => {
  const state = getQcReviewActionAvailability({
    hasCompletion: true,
    latestDecisionCode: 'rejected',
    hasCorrection: true
  });

  assert.equal(state.visible, true);
  assert.equal(state.readyForRecheck, true);
  assert.equal(state.acceptEnabled, true);
  assert.equal(state.rejectEnabled, true);
});
