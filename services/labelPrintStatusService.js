'use strict';

const labelPrintHistoryModel = require('../models/labelPrintHistoryModel');
const labelPrinterRuntimeService = require('./labelPrinterRuntimeService');
const { normalizeRequestOutputs, summarizeStates } = require('./labelPrintCupsStatusPolicy');

async function reconcileRecentPrintStatuses({ actorUserId, minutes }) {
  const attempts = await labelPrintHistoryModel.listRecentQueuedAttempts({ actorUserId, minutes });
  if (!attempts.length) return 0;

  const requests = [];
  for (const attempt of attempts) {
    for (const requestOutput of normalizeRequestOutputs(attempt.cupsJobIdsJson)) {
      requests.push({
        attemptId: attempt.attemptId,
        queue: attempt.cupsQueue,
        requestOutput
      });
    }
  }
  if (!requests.length) return 0;

  const states = await labelPrinterRuntimeService.getCupsRequestStates(requests);
  const byAttempt = new Map();
  for (const state of states) {
    if (!byAttempt.has(state.attemptId)) byAttempt.set(state.attemptId, []);
    byAttempt.get(state.attemptId).push(state);
  }

  let updated = 0;
  for (const attempt of attempts) {
    const summary = summarizeStates(byAttempt.get(attempt.attemptId) || []);
    if (!summary) continue;
    await labelPrintHistoryModel.reconcilePrintAttemptStatus({
      attemptId: attempt.attemptId,
      itemId: attempt.itemId,
      jobId: attempt.jobId,
      status: summary.status,
      failureMessage: summary.failureMessage
    });
    updated += 1;
  }
  return updated;
}

module.exports = { reconcileRecentPrintStatuses };
