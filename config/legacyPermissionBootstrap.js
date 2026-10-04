'use strict';

const { PERMISSION_KEYS } = require('./permissionCatalog');

const TECH_GRANTS = Object.freeze([
  'dashboards.tech.view',
  'units.view',
  'units.create',
  'units.edit',
  'units.park',
  'units.complete',
  'units.history.view',
  'units.tool_details.view',
  'units.labels.print',
  'units.override.request',
  'qc.correction.submit',
  'requests.view',
  'requests.submit',
  'catalog_requests.submit',
  'labels.print',
  'printers.solo.manage',
  'huddle.personal.view',
  'tools.unit_api.use'
]);

const QC_GRANTS = Object.freeze([
  'dashboards.tech.view',
  'units.view',
  'units.history.view',
  'units.tool_details.view',
  'qc.portal.view',
  'qc.review.perform',
  'qc.reversion.request',
  'requests.view',
  'requests.submit',
  'catalog_requests.submit',
  'huddle.personal.view'
]);

const TECH_LEAD_EXTRA_GRANTS = Object.freeze([
  'dashboards.tech.team_metrics.view',
  'units.delete',
  'units.return_to_active',
  'units.reverse_completion',
  'units.assignment.manage',
  'units.override.review',
  'units.production_weight.view',
  'units.production_weight.override',
  'units.completion_attribution.change',
  'units.tool_requirements.override',
  'units.outcome.approve',
  'qc.portal.view',
  'qc.review.perform',
  'qc.correction.submit',
  'qc.correction.submit_any',
  'qc.reversion.request',
  'qc.reversion.perform',
  'qc.summary.cross_technician',
  'requests.review',
  'catalog_requests.review',
  'printers.solo.manage_any',
  'printers.network_details.view'
]);

const MANAGEMENT_EXTRA_GRANTS = Object.freeze([
  'dashboards.management.view',
  'units.export',
  'lots.view',
  'lots.create',
  'lots.edit',
  'lots.duplicate',
  'lots.visibility.manage',
  'lots.close',
  'lots.reopen',
  'lots.delete',
  'lots.requirements.manage',
  'lots.unit_form.configure',
  'lots.unit_browser.configure',
  'lots.labels.configure',
  'lots.validation.override',
  'lots.export',
  'lots.amazon_tags.generate',
  'labels.library.view',
  'labels.library.manage',
  'labels.builder.manage',
  'labels.assets.manage',
  'huddle.send',
  'huddle.administration.view',
  'huddle.recipients.add',
  'huddle.recipients.revoke',
  'huddle.messages.delete',
  'audit.login.view'
]);

function union(...sets) {
  return [...new Set(sets.flat())];
}

const LEGACY_ROLE_GRANTS = Object.freeze({
  tech: TECH_GRANTS,
  qc: QC_GRANTS,
  tech_lead: Object.freeze(union(TECH_GRANTS, TECH_LEAD_EXTRA_GRANTS)),
  management: Object.freeze(union(TECH_GRANTS, TECH_LEAD_EXTRA_GRANTS, MANAGEMENT_EXTRA_GRANTS)),
  admin: Object.freeze(PERMISSION_KEYS.filter((permissionKey) => !['security.super_admin.manage', 'users.tool_pin.self_manage', 'huddle.recipients.require', 'dashboards.productivity.count'].includes(permissionKey))),
  super_admin: Object.freeze(PERMISSION_KEYS.filter((permissionKey) => permissionKey !== 'dashboards.productivity.count'))
});

module.exports = {
  LEGACY_ROLE_GRANTS
};
