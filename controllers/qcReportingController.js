'use strict';

const qcReportingModel = require('../models/qcReportingModel');
const {
  buildManagementQcReport,
  createEmptyManagementQcReport
} = require('../services/qcReportingService');
const {
  buildQcReportingScope,
  QcReportingScopeError,
  REPORTING_PERIODS
} = require('../services/qcReportingScope');

function createDefaultScope() {
  return buildQcReportingScope({}, []);
}

function renderQcReportingPage(res, {
  report = createEmptyManagementQcReport(),
  reportAvailable = true,
  reportError = null,
  filterError = null,
  scope = createDefaultScope(),
  technicianOptions = [],
  status = 200
} = {}) {
  return res.status(status).render('pages/management-qc-reporting', {
    pageTitle: 'QC Reporting',
    currentNav: 'management-qc-reporting',
    report,
    reportAvailable,
    reportError,
    filterError,
    scope,
    reportingPeriods: REPORTING_PERIODS,
    technicianOptions,
    generatedAt: new Date()
  });
}

async function renderManagementQcReportingPage(req, res, next) {
  let technicianOptions = [];

  try {
    technicianOptions = await qcReportingModel.listManagementQcReportingTechnicianOptions();
    const scope = buildQcReportingScope(req.query, technicianOptions);
    const rows = await qcReportingModel.listManagementQcReportingRows(scope.queryFilters);
    const report = buildManagementQcReport(rows);

    return renderQcReportingPage(res, {
      report,
      scope,
      technicianOptions
    });
  } catch (error) {
    if (error instanceof QcReportingScopeError || error?.code === 'BWT_QC_REPORTING_SCOPE_INVALID') {
      return renderQcReportingPage(res, {
        filterError: error.message,
        technicianOptions,
        status: 400
      });
    }

    if (error && error.code === 'BWT_QC_REPORTING_SCHEMA_REQUIRED') {
      return renderQcReportingPage(res, {
        reportAvailable: false,
        reportError: error.message,
        technicianOptions
      });
    }

    return next(error);
  }
}

module.exports = {
  renderManagementQcReportingPage
};
