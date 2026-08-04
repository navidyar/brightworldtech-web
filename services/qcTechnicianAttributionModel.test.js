'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildQcTechnicianAttributionSql,
  normalizeAlias
} = require('./qcTechnicianAttribution');
const { calculateQcGradeSummary } = require('./qcGradingService');

test('QC technician attribution prefers assignment history at review time and falls back safely', () => {
  const attribution = buildQcTechnicianAttributionSql({
    capabilities: {
      hasCurrentAssignment: true,
      hasAssignmentHistory: true
    }
  });

  assert.match(attribution.joins, /LEFT JOIN units qc_attribution_unit/);
  assert.match(attribution.joins, /LEFT JOIN unit_assignment_history qc_attribution_assignment/);
  assert.match(attribution.joins, /assignment_lookup\.changed_at <= qc\.reviewed_at/);
  assert.match(attribution.joins, /ORDER BY assignment_lookup\.changed_at DESC, assignment_lookup\.unit_assignment_history_id DESC/);
  assert.match(attribution.expression, /WHEN qc_attribution_assignment\.unit_assignment_history_id IS NOT NULL/);
  assert.match(attribution.expression, /qc_attribution_assignment\.to_user_id/);
  assert.match(attribution.expression, /qc_attribution_unit\.assigned_to_user_id/);
  assert.match(attribution.expression, /completion\.completed_by_user_id/);
});

test('QC technician attribution remains compatible with databases lacking assignment history', () => {
  const currentAssignmentOnly = buildQcTechnicianAttributionSql({
    capabilities: { hasCurrentAssignment: true, hasAssignmentHistory: false }
  });
  const completionOnly = buildQcTechnicianAttributionSql({
    capabilities: { hasCurrentAssignment: false, hasAssignmentHistory: false }
  });

  assert.equal(
    currentAssignmentOnly.expression,
    'COALESCE(qc_attribution_unit.assigned_to_user_id, completion.completed_by_user_id)'
  );
  assert.equal(completionOnly.expression, 'completion.completed_by_user_id');
  assert.equal(completionOnly.joins, '');
});

test('two accepted QC reviews attributed to the assigned technician produce a graded 100 percent result', () => {
  const summary = calculateQcGradeSummary([
    {
      technician_user_id: 42,
      unit_work_completion_id: 901,
      unit_qc_check_id: 1001,
      decision_code: 'accepted'
    },
    {
      technician_user_id: 42,
      unit_work_completion_id: 902,
      unit_qc_check_id: 1002,
      decision_code: 'accepted'
    }
  ], { technicianUserId: 42 });

  assert.equal(summary.gradingStatus, 'graded');
  assert.equal(summary.reviewedUnits, 2);
  assert.equal(summary.firstPassAcceptedUnits, 2);
  assert.equal(summary.qualityGrade, 100);
  assert.equal(summary.currentAcceptanceRate, 100);
});

test('SQL aliases are restricted to safe identifiers', () => {
  assert.equal(normalizeAlias('safe_alias_1', 'fallback'), 'safe_alias_1');
  assert.equal(normalizeAlias('unsafe alias', 'fallback'), 'fallback');
  assert.equal(normalizeAlias('qc; DROP TABLE units', 'fallback'), 'fallback');
});
