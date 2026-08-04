'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQcStatusPresentation } = require('./qcStatusPresentation');

function review(qcCheckId, decisionCode) {
  return { qcCheckId, decisionCode, decisionLabel: decisionCode === 'accepted' ? 'Accepted' : 'Rejected' };
}

function correction(qcCorrectionId, rejectedQcCheckId) {
  return { qcCorrectionId, rejectedQcCheckId };
}

test('first-pass acceptance receives a compact accepted presentation', () => {
  const presentation = buildQcStatusPresentation({ reviews: [review(1, 'accepted')] });

  assert.equal(presentation.statusCode, 'accepted');
  assert.equal(presentation.title, 'Accepted by Quality Control');
  assert.deepEqual(presentation.workflowSteps, []);
});

test('unresolved rejection is presented as pending correction', () => {
  const presentation = buildQcStatusPresentation({ reviews: [review(2, 'rejected')] });

  assert.equal(presentation.statusCode, 'rejected');
  assert.equal(presentation.statusLabel, 'Pending correction');
  assert.deepEqual(presentation.workflowSteps.map((step) => step.label), ['Rejected', 'Correction required']);
});

test('correction tied to the latest rejection is presented as ready for recheck', () => {
  const presentation = buildQcStatusPresentation({
    reviews: [review(3, 'rejected')],
    corrections: [correction(10, 3)]
  });

  assert.equal(presentation.statusCode, 'ready_recheck');
  assert.equal(presentation.latestReviewCorrection.qcCorrectionId, 10);
  assert.deepEqual(presentation.workflowSteps.map((step) => step.label), ['Rejected', 'Corrected', 'Ready for recheck']);
});

test('acceptance after any rejection is presented as corrected and accepted', () => {
  const presentation = buildQcStatusPresentation({
    reviews: [review(4, 'rejected'), review(5, 'accepted')],
    corrections: [correction(11, 4)]
  });

  assert.equal(presentation.statusCode, 'corrected');
  assert.equal(presentation.statusLabel, 'Accepted after correction');
  assert.equal(presentation.latestCorrection.qcCorrectionId, 11);
  assert.deepEqual(presentation.workflowSteps.map((step) => step.label), ['Rejected', 'Corrected', 'Accepted']);
});


test('an older correction is not displayed beneath a newer unresolved rejection', () => {
  const presentation = buildQcStatusPresentation({
    reviews: [review(9, 'rejected'), review(10, 'rejected')],
    corrections: [correction(13, 9)]
  });

  assert.equal(presentation.statusCode, 'rejected');
  assert.equal(presentation.latestCorrection, null);
});

test('historical accept-reject-correct-accept is still described conservatively', () => {
  const presentation = buildQcStatusPresentation({
    reviews: [review(6, 'accepted'), review(7, 'rejected'), review(8, 'accepted')],
    corrections: [correction(12, 7)]
  });

  assert.equal(presentation.statusCode, 'corrected');
  assert.equal(presentation.title, 'Corrected and accepted');
});
