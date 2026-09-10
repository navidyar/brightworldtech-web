'use strict';

const labelPrintSettingsModel = require('../models/labelPrintSettingsModel');
const {
  MIN_RECENT_PRINTS_MINUTES,
  MAX_RECENT_PRINTS_MINUTES,
  MIN_PRINT_SET_GROUPING_GAP_MINUTES,
  MAX_PRINT_SET_GROUPING_GAP_MINUTES,
  parseRecentPrintsMinutes,
  parsePrintSetGroupingGapMinutes
} = require('../services/labelPrintSettingsPolicy');

async function renderPrintingConfigPage(req, res, next) {
  try {
    const settings = await labelPrintSettingsModel.getLabelPrintSettings();
    return res.render('pages/management-printing-config', {
      pageTitle: 'Printing Configuration',
      currentNav: 'admin-config-printing',
      settings,
      saved: req.query.saved === '1',
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updatePrintingConfig(req, res, next) {
  try {
    const recentPrintsMinutes = parseRecentPrintsMinutes(req.body.recentPrintsMinutes);
    const printSetGroupingGapMinutes = parsePrintSetGroupingGapMinutes(req.body.printSetGroupingGapMinutes);
    const errorMessages = [];

    if (recentPrintsMinutes === null) {
      errorMessages.push(`Recent Prints duration must be a whole number from ${MIN_RECENT_PRINTS_MINUTES} through ${MAX_RECENT_PRINTS_MINUTES} minutes.`);
    }
    if (printSetGroupingGapMinutes === null) {
      errorMessages.push(`Print Set grouping gap must be a whole number from ${MIN_PRINT_SET_GROUPING_GAP_MINUTES} through ${MAX_PRINT_SET_GROUPING_GAP_MINUTES} minutes.`);
    }

    if (errorMessages.length) {
      return res.status(400).render('pages/management-printing-config', {
        pageTitle: 'Printing Configuration',
        currentNav: 'admin-config-printing',
        settings: {
          recentPrintsMinutes: req.body.recentPrintsMinutes,
          printSetGroupingGapMinutes: req.body.printSetGroupingGapMinutes
        },
        saved: false,
        errorMessages
      });
    }

    await labelPrintSettingsModel.updateLabelPrintSettings({
      recentPrintsMinutes,
      printSetGroupingGapMinutes,
      updatedByUserId: req.currentUser?.user_id || null
    });
    return res.redirect('/management/config/printing?saved=1');
  } catch (error) {
    next(error);
  }
}

module.exports = { renderPrintingConfigPage, updatePrintingConfig };
