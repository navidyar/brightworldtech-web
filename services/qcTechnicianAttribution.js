'use strict';

function normalizeAlias(value, fallback) {
  const alias = String(value || '').trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(alias) ? alias : fallback;
}

function buildQcTechnicianAttributionSql({
  capabilities = {},
  qcAlias = 'qc',
  completionAlias = 'completion',
  unitAlias = 'qc_attribution_unit',
  assignmentAlias = 'qc_attribution_assignment'
} = {}) {
  const safeQcAlias = normalizeAlias(qcAlias, 'qc');
  const safeCompletionAlias = normalizeAlias(completionAlias, 'completion');
  const safeUnitAlias = normalizeAlias(unitAlias, 'qc_attribution_unit');
  const safeAssignmentAlias = normalizeAlias(assignmentAlias, 'qc_attribution_assignment');
  const joins = [];

  if (capabilities.hasCurrentAssignment) {
    joins.push(`LEFT JOIN units ${safeUnitAlias}\n        ON ${safeUnitAlias}.unit_id = ${safeCompletionAlias}.unit_id`);
  }

  if (capabilities.hasAssignmentHistory) {
    joins.push(`LEFT JOIN unit_assignment_history ${safeAssignmentAlias}\n        ON ${safeAssignmentAlias}.unit_assignment_history_id = (\n          SELECT assignment_lookup.unit_assignment_history_id\n          FROM unit_assignment_history assignment_lookup\n          WHERE assignment_lookup.unit_id = ${safeCompletionAlias}.unit_id\n            AND assignment_lookup.changed_at <= ${safeQcAlias}.reviewed_at\n          ORDER BY assignment_lookup.changed_at DESC, assignment_lookup.unit_assignment_history_id DESC\n          LIMIT 1\n        )`);
  }

  let expression = `${safeCompletionAlias}.completed_by_user_id`;

  if (capabilities.hasAssignmentHistory && capabilities.hasCurrentAssignment) {
    expression = `CASE\n          WHEN ${safeAssignmentAlias}.unit_assignment_history_id IS NOT NULL\n            THEN COALESCE(${safeAssignmentAlias}.to_user_id, ${safeCompletionAlias}.completed_by_user_id)\n          ELSE COALESCE(${safeUnitAlias}.assigned_to_user_id, ${safeCompletionAlias}.completed_by_user_id)\n        END`;
  } else if (capabilities.hasAssignmentHistory) {
    expression = `CASE\n          WHEN ${safeAssignmentAlias}.unit_assignment_history_id IS NOT NULL\n            THEN COALESCE(${safeAssignmentAlias}.to_user_id, ${safeCompletionAlias}.completed_by_user_id)\n          ELSE ${safeCompletionAlias}.completed_by_user_id\n        END`;
  } else if (capabilities.hasCurrentAssignment) {
    expression = `COALESCE(${safeUnitAlias}.assigned_to_user_id, ${safeCompletionAlias}.completed_by_user_id)`;
  }

  return {
    expression,
    joins: joins.join('\n      '),
    capabilities: {
      hasCurrentAssignment: capabilities.hasCurrentAssignment === true,
      hasAssignmentHistory: capabilities.hasAssignmentHistory === true
    }
  };
}

module.exports = {
  buildQcTechnicianAttributionSql,
  normalizeAlias
};
