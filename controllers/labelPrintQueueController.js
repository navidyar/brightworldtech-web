'use strict';

const labelPrintHistoryModel = require('../models/labelPrintHistoryModel');
const labelPrintSettingsModel = require('../models/labelPrintSettingsModel');

async function renderRecentPrintsModal(req, res, next) {
  try {
    const settings = await labelPrintSettingsModel.getLabelPrintSettings();
    const actorUserId = Number(req.currentUser?.user_id || 0);
    const sets = await labelPrintHistoryModel.listRecentPrintSets({ actorUserId, minutes: settings.recentPrintsMinutes });
    return res.render('fragments/tech-recent-prints-modal', { settings, sets });
  } catch (error) {
    next(error);
  }
}

async function renderRecentPrintsSummary(req, res, next) {
  try {
    const settings = await labelPrintSettingsModel.getLabelPrintSettings();
    const actorUserId = Number(req.currentUser?.user_id || 0);
    const summary = await labelPrintHistoryModel.getRecentPrintSummary({ actorUserId, minutes: settings.recentPrintsMinutes });
    return res.render('fragments/tech-recent-prints-summary', { summary });
  } catch (error) {
    next(error);
  }
}

module.exports = { renderRecentPrintsModal, renderRecentPrintsSummary };
