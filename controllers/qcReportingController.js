'use strict';

const qcReportingModel = require('../models/qcReportingModel');
const qcReviewerAuditModel = require('../models/qcReviewerAuditModel');
const {
  buildManagementQcReport,
  createEmptyManagementQcReport
} = require('../services/qcReportingService');
const {
  buildQcReportingScope,
  QcReportingScopeError,
  REPORTING_PERIODS
} = require('../services/qcReportingScope');

function hasPermission(req, permissionKey) {
  return req.currentPermissions instanceof Set && req.currentPermissions.has(permissionKey);
}

function createDefaultScope(timeZone = 'UTC') {
  return buildQcReportingScope({}, [], { timeZone });
}

function renderQcReportingPage(res, {
  report = createEmptyManagementQcReport(),
  reportAvailable = true,
  reportError = null,
  filterError = null,
  scope = null,
  technicianOptions = [],
  reviewerAuditAvailable = false,
  canViewQcTeamOversight = false,
  canPerformQcReviewerAudit = false,
  status = 200
} = {}) {
  const resolvedScope = scope || createDefaultScope(res.locals.timeZone || 'UTC');

  return res.status(status).render('pages/management-qc-reporting', {
    pageTitle: 'QC Reporting',
    currentNav: 'management-qc-reporting',
    report,
    reportAvailable,
    reportError,
    filterError,
    scope: resolvedScope,
    reportingPeriods: REPORTING_PERIODS,
    technicianOptions,
    reviewerAuditAvailable,
    canViewQcTeamOversight,
    canPerformQcReviewerAudit,
    generatedAt: new Date()
  });
}

async function renderManagementQcReportingPage(req, res, next) {
  let technicianOptions = [];
  const canViewQcTeamOversight = hasPermission(req, 'qc.team_oversight.view');
  const canPerformQcReviewerAudit = hasPermission(req, 'qc.reviewer_audit.perform');
  let reviewerAuditAvailable = false;

  try {
    reviewerAuditAvailable = await qcReviewerAuditModel.isQcReviewerAuditSchemaReady();
    technicianOptions = await qcReportingModel.listManagementQcReportingTechnicianOptions();
    const scope = buildQcReportingScope(req.query, technicianOptions, { timeZone: req.timeZone });
    const rows = await qcReportingModel.listManagementQcReportingRows(scope.queryFilters);
    const report = buildManagementQcReport(rows);

    return renderQcReportingPage(res, {
      report,
      scope,
      technicianOptions,
      reviewerAuditAvailable,
      canViewQcTeamOversight,
      canPerformQcReviewerAudit
    });
  } catch (error) {
    if (error instanceof QcReportingScopeError || error?.code === 'BWT_QC_REPORTING_SCOPE_INVALID') {
      return renderQcReportingPage(res, {
        filterError: error.message,
        technicianOptions,
        reviewerAuditAvailable,
        canViewQcTeamOversight,
        canPerformQcReviewerAudit,
        status: 400
      });
    }

    if (error && error.code === 'BWT_QC_REPORTING_SCHEMA_REQUIRED') {
      return renderQcReportingPage(res, {
        reportAvailable: false,
        reportError: error.message,
        technicianOptions,
        reviewerAuditAvailable,
        canViewQcTeamOversight,
        canPerformQcReviewerAudit
      });
    }

    return next(error);
  }
}

function auditErrorStatus(error) {
  if (!error || !error.code) return 500;
  if (error.code === 'BWT_QC_REVIEWER_AUDIT_NOT_FOUND') return 404;
  if (error.code === 'BWT_QC_REVIEWER_AUDIT_SELF_REVIEW') return 403;
  if (error.code === 'BWT_QC_REVIEWER_AUDIT_EXISTS' || error.code === 'BWT_QC_REVIEWER_AUDIT_REVERTED') return 409;
  if (error.code === 'BWT_QC_REVIEWER_AUDIT_SCHEMA_REQUIRED') return 503;
  if (error.code === 'BWT_QC_REVIEWER_AUDIT_INPUT_INVALID') return 400;
  return 500;
}

async function renderReviewerAuditModal(req, res, next) {
  try {
    const review = await qcReviewerAuditModel.getReviewForAudit(req.params.qcCheckId);
    if (!review) {
      return res.status(404).render('fragments/qc-reviewer-audit-modal', {
        review: null,
        currentUserId: req.currentUser.user_id,
        noticeMessage: '',
        errorMessages: ['The selected QC decision could not be found.'],
        formData: { outcome: '', notes: '' }
      });
    }
    return res.render('fragments/qc-reviewer-audit-modal', {
      review,
      currentUserId: req.currentUser.user_id,
      noticeMessage: '',
      errorMessages: [],
      formData: { outcome: '', notes: '' }
    });
  } catch (error) {
    if (error?.code === 'BWT_QC_REVIEWER_AUDIT_SCHEMA_REQUIRED') {
      return res.status(503).render('fragments/qc-reviewer-audit-modal', {
        review: null,
        currentUserId: req.currentUser.user_id,
        noticeMessage: '',
        errorMessages: [error.message],
        formData: { outcome: '', notes: '' }
      });
    }
    return next(error);
  }
}

async function submitReviewerAudit(req, res, next) {
  const formData = {
    outcome: String(req.body?.outcome || '').trim(),
    notes: String(req.body?.notes || '').trim()
  };
  try {
    const review = await qcReviewerAuditModel.recordReviewerAudit({
      qcCheckId: req.params.qcCheckId,
      auditedByUserId: req.currentUser.user_id,
      outcome: formData.outcome,
      notes: formData.notes
    });
    return res.render('fragments/qc-reviewer-audit-modal', {
      review,
      currentUserId: req.currentUser.user_id,
      noticeMessage: 'QC reviewer audit recorded. The original QC decision was not changed.',
      errorMessages: [],
      formData: { outcome: '', notes: '' }
    });
  } catch (error) {
    const status = auditErrorStatus(error);
    if (status < 500 || error?.code === 'BWT_QC_REVIEWER_AUDIT_SCHEMA_REQUIRED') {
      let review = null;
      try { review = await qcReviewerAuditModel.getReviewForAudit(req.params.qcCheckId); } catch (_loadError) { /* render original error */ }
      return res.status(status).render('fragments/qc-reviewer-audit-modal', {
        review,
        currentUserId: req.currentUser.user_id,
        noticeMessage: '',
        errorMessages: [error.message],
        formData
      });
    }
    return next(error);
  }
}

module.exports = {
  renderManagementQcReportingPage,
  renderReviewerAuditModal,
  submitReviewerAudit
};
