'use strict';

function permission(permissionKey, group, name, description) {
  return Object.freeze({ permissionKey, group, name, description });
}

const PERMISSIONS = Object.freeze([
  permission('dashboards.admin.view', 'Dashboards', 'View Admin Dashboard', 'Open the Admin dashboard and view its administrative summaries and shortcuts.'),
  permission('dashboards.management.view', 'Dashboards', 'View Management Dashboard', 'Open the Management dashboard and view management-level operational summaries.'),
  permission('dashboards.tech.view', 'Dashboards', 'View Tech Dashboard', 'Open the Tech dashboard and view technician-focused production summaries.'),
  permission('dashboards.tech.team_metrics.view', 'Dashboards', 'View Team Tech Metrics', 'On the Tech Dashboard, select other technicians and view team-wide productivity metrics instead of being limited to your own metrics.'),
  permission('dashboards.productivity.count', 'Dashboards', 'Count User in Productivity Metrics', 'Include this user in productivity dashboard calculations, team averages, and technician lists. Users without this effective permission are excluded from productivity reporting.'),

  permission('units.view', 'Units', 'View Units', 'Open Unit Browser and Unit Details and view Unit information within the scope allowed to the signed-in user.'),
  permission('units.create', 'Units', 'Create Units', 'Create new Unit records in the application.'),
  permission('units.edit', 'Units', 'Edit Units', 'Change Unit production, specification, test, and workflow data when the Unit and Lot allow editing.'),
  permission('units.delete', 'Units', 'Delete Units', 'Permanently delete eligible Unit records when deletion safeguards allow.'),
  permission('units.park', 'Units', 'Park Units', 'Move an eligible active Unit into Parked state. Parking clears its current Lot and assignment while preserving history.'),
  permission('units.return_to_active', 'Units', 'Return Units to Active', 'Return a Parked Unit to Active, choose an eligible destination Lot, and optionally select an eligible assignee.'),
  permission('units.complete', 'Units', 'Complete Units', 'Record eligible Unit work as complete. Completion credit defaults to the signed-in user unless separate authority allows another eligible technician to receive the credit.'),
  permission('units.reverse_completion', 'Units', 'Reverse Unit Completion', 'Reverse an eligible prior manual completion record and require a reason for the reversal.'),
  permission('units.export', 'Units', 'Export Units', 'Preview and download Unit Browser results using the current filters and access scope.'),
  permission('units.history.view', 'Units', 'View Unit History', 'View a Unit audit timeline, lifecycle changes, assignment history, and other recorded Unit history.'),
  permission('units.tool_details.view', 'Units', 'View Tool Details', 'View Unit data and evidence detected or submitted by ScanTools and TechTools.'),
  permission('units.labels.print', 'Units', 'Print Unit Labels', 'Print labels for Units from authorized Unit Browser and Unit Detail workflows.'),
  permission('units.assignment.manage', 'Unit Authority', 'Manage Unit Assignment', 'Reserved for direct active-Unit assignment and reassignment controls. Current Return to Active and approved takeover workflows use their own permissions.'),
  permission('units.override.request', 'Unit Authority', 'Request Unit Override', 'Submit a Unit move, takeover, or other override request when the workflow does not allow the action directly.'),
  permission('units.override.review', 'Unit Authority', 'Approve Unit Override Requests', 'View and approve or reject Unit move, takeover, and other override requests. Outcome-confirmation requests use a separate permission.'),
  permission('units.production_weight.view', 'Unit Authority', 'View Production Weight', 'View the production weight and effective weighting details used for Unit completion credit.'),
  permission('units.production_weight.override', 'Unit Authority', 'Override Production Weight', 'Set or clear a Unit-level production weight override when the workflow allows it.'),
  permission('units.completion_attribution.change', 'Unit Authority', 'Choose Unit Completion Credit', 'When completing an eligible Unit, choose whether completion and production credit is recorded for yourself or the technician currently assigned to the Unit. This does not change the Unit assignment.'),
  permission('units.tool_requirements.override', 'Unit Authority', 'Override Tool Completion Requirements', 'Allow Unit completion when required ScanTools or TechTools runs are missing for the current production cycle. A reason is required.'),
  permission('units.outcome.approve', 'Unit Authority', 'Approve Outcome Confirmation Requests', 'View and approve or reject Unit outcome-confirmation requests that require elevated approval.'),

  permission('lots.view', 'Lots', 'View Lots', 'Open Lot lists and Lot Details and view the Lot hierarchy and Lot information.'),
  permission('lots.create', 'Lots', 'Create Lots', 'Create new Lots.'),
  permission('lots.edit', 'Lots', 'Edit Lots', 'Change Lot details and standard Lot settings.'),
  permission('lots.duplicate', 'Lots', 'Duplicate Lots', 'Create a new Lot by copying an existing Lot and its supported configuration.'),
  permission('lots.visibility.manage', 'Lots', 'Manage Lot Visibility', 'Hide or unhide Lots in the application.'),
  permission('lots.close', 'Lots', 'Close Lots', 'Close eligible Lots so their active workflow is no longer available.'),
  permission('lots.reopen', 'Lots', 'Reopen Lots', 'Reopen eligible closed Lots and return them to active use.'),
  permission('lots.delete', 'Lots', 'Delete Lots', 'Delete eligible Lots only when Lot deletion safeguards permit it.'),
  permission('lots.requirements.manage', 'Lots', 'Manage Lot Requirements', 'Create, edit, suppress, restore, and delete Lot requirement rules.'),
  permission('lots.unit_form.configure', 'Lots', 'Configure Lot Unit Form', 'Choose which Unit Form fields are shown, hidden, optional, or required for a Lot.'),
  permission('lots.unit_browser.configure', 'Lots', 'Configure Lot Unit Browser', 'Configure the Unit Browser columns, layout, and related Lot-specific browser settings.'),
  permission('lots.labels.configure', 'Lots', 'Configure Lot Labels', 'Choose Lot label templates, print-set behavior, copies, and related Lot label settings.'),
  permission('lots.validation.override', 'Lots', 'Manage Lot Validation Overrides', 'Create, revoke, and manage allowed exceptions to Lot validation or requirement failures.'),
  permission('lots.export', 'Lots', 'Export Lot Units', 'Preview and download Units within the selected Lot scope, including permitted descendant scope.'),
  permission('lots.amazon_tags.generate', 'Lots', 'Generate Amazon Asset Tags', 'Generate missing permanent Amazon Asset Tags for Units when that feature is enabled for the Lot.'),

  permission('qc.portal.view', 'Quality Control', 'View QC Portal', 'Open the QC Review portal and view the QC queues available to the user.'),
  permission('qc.review.perform', 'Quality Control', 'Perform QC Review', 'Accept or reject eligible Units in QC and submit the QC review decision.'),
  permission('qc.correction.submit', 'Quality Control', 'Submit Own QC Corrections', 'Mark a QC-rejected Unit corrected when it is assigned to the signed-in user and the correction workflow allows it.'),
  permission('qc.correction.submit_any', 'Quality Control', 'Submit QC Corrections for Any Technician', 'Mark eligible QC-rejected Units corrected even when they are assigned to another technician.'),
  permission('qc.reversion.request', 'Quality Control', 'Request QC Reversion', 'Request that an eligible recorded QC decision be reverted.'),
  permission('qc.reversion.perform', 'Quality Control', 'Approve QC Reversion Requests', 'View and approve or reject QC-reversion requests. This permission also retains the existing authority to directly revert eligible QC decisions.'),
  permission('qc.summary.cross_technician', 'Quality Control', 'View Team QC Summary', 'View QC Performance summaries for all technicians or a selected technician. Without this permission, the Tech Units QC summary is limited to the signed-in user.'),
  permission('qc.reporting.view', 'Quality Control', 'View QC Reporting', 'Open Management QC Reporting and view the reporting scopes and technician-level QC metrics it provides.'),
  permission('qc.team_oversight.view', 'Quality Control', 'View QC Team Oversight', 'View second-level QC reviewer audit coverage, agreement, and exception metrics in QC Reporting. QC Reporting access is still required to open the page.'),
  permission('qc.reviewer_audit.perform', 'Quality Control', 'Perform QC Reviewer Audits', 'Perform independent spot checks of another QC reviewer’s recorded decision and record Agree, QC Missed Defect, or QC False Rejection. This does not change the original QC decision.'),

  permission('requests.view', 'Requests', 'View Requests', 'Open the Requests area. Users still see only their own requests unless a separate approval permission grants broader visibility for that request type.'),
  permission('requests.submit', 'Requests', 'Submit Requests', 'Submit supported non-catalog operational Unit requests.'),
  permission('requests.review', 'Requests', 'Approve Intentional Duplicate Requests', 'View and approve or reject Intentional Duplicate requests. Other request types use their own approval permissions.'),
  permission('catalog_requests.submit', 'Requests', 'Submit Catalog Requests', 'Submit Model, Processor, or other supported catalog addition/change requests.'),
  permission('catalog_requests.review', 'Requests', 'View Catalog Requests', 'View Model and Processor Catalog requests without granting approval authority.'),
  permission('catalog_requests.model.review', 'Requests', 'Approve Model Catalog Requests', 'View and approve or reject Model Catalog Addition requests.'),
  permission('catalog_requests.processor.review', 'Requests', 'Approve Processor Catalog Requests', 'View and approve or reject Processor Catalog Addition requests.'),

  permission('labels.library.view', 'Labels', 'View Label Library', 'Open the Label Library and view templates and shared assets.'),
  permission('labels.library.manage', 'Labels', 'Manage Label Library', 'Create, edit, duplicate, reorder, retire, reactivate, and delete Label Library templates where allowed.'),
  permission('labels.builder.manage', 'Labels', 'Manage Label Designs', 'Create and edit label layouts in the visual Label Builder.'),
  permission('labels.assets.manage', 'Labels', 'Manage Label Assets', 'Upload, rename, and delete shared images and other Label Library assets.'),
  permission('labels.print', 'Labels', 'Print Labels', 'Submit label print jobs from application workflows that support printing.'),

  permission('printers.solo.manage', 'Printers', 'Manage Own Printers', 'Create and manage printers owned by the signed-in user.'),
  permission('printers.solo.manage_any', 'Printers', 'Manage Other Users\' Personal Printers', 'Manage user-owned personal printers belonging to other users.'),
  permission('printers.managed.view', 'Printers', 'View Managed Printers', 'View the shared Managed Printer registry and printer groups.'),
  permission('printers.managed.manage', 'Printers', 'Manage Managed Printers', 'Create, edit, enable, disable, and otherwise administer shared Managed Printers.'),
  permission('printers.groups.manage', 'Printers', 'Manage Printer Groups', 'Create, edit, and administer printer groups and group routing.'),
  permission('printers.network_details.view', 'Printers', 'View Printer Network Details', 'View IP addresses, ports, queues, protocols, and other connection details for printers outside the signed-in user\'s own printers.'),

  permission('configuration.view', 'Configuration', 'View Configuration', 'Open the Configuration area and view configuration sections allowed by other configuration permissions.'),
  permission('configuration.values.manage', 'Configuration', 'Manage Configuration Values', 'Create, edit, reorder, activate, and deactivate standard Configuration values.'),
  permission('configuration.processors.manage', 'Configuration', 'Manage Processor Catalog', 'Create, edit, merge, map, and otherwise manage Processor catalog records.'),
  permission('configuration.processor_families.manage', 'Configuration', 'Manage Processor Families', 'Create and manage reusable Processor Family definitions and their Processor membership.'),
  permission('configuration.models.manage', 'Configuration', 'Manage Unit Models', 'Create and manage Unit Model catalog records and model metadata.'),
  permission('configuration.printing.manage', 'Configuration', 'Manage Printing Configuration', 'Change global printing configuration used by BWTDallas.'),
  permission('configuration.label_fields.manage', 'Configuration', 'Manage Label Dynamic Fields', 'Configure which dynamic Unit/Lot values are available to label templates and how those fields are defined.'),
  permission('configuration.operational_rankings.manage', 'Configuration', 'Manage Operational Rankings', 'Manage configuration that controls operational popularity/ranking values and their refresh behavior.'),
  permission('configuration.database.view', 'Configuration', 'View Database Check', 'View the database consistency and readiness checks exposed in Configuration.'),

  permission('users.view', 'Users', 'View Users', 'View active and inactive user accounts and their basic account details.'),
  permission('users.create', 'Users', 'Create Users', 'Create user accounts and generate their initial password setup link.'),
  permission('users.edit', 'Users', 'Edit Users', 'Edit user profile information such as name, email, phone, and employment dates. Role assignment and Tool PINs use separate permissions.'),
  permission('users.status.manage', 'Users', 'Manage User Status', 'Activate or deactivate eligible user accounts.'),
  permission('users.delete', 'Users', 'Delete Users', 'Permanently delete only eligible unused or pending user accounts when deletion safeguards allow.'),
  permission('users.setup_links.manage', 'Users', 'Manage User Setup Links', 'Generate and revoke initial password setup links and password reset links for users.'),
  permission('users.tool_pin.manage', 'Users', 'Manage Tool PINs', 'Register, reset, or remove another user\'s 6–10 digit Tool-only PIN. This does not grant access to ScanTools or TechTools by itself.'),
  permission('users.tool_pin.self_manage', 'Users', 'Manage Own Tool PIN', 'Set or change only the signed-in user\'s own Tool PIN. Effective Tool API access is also required before the self-service control is available.'),
  permission('users.login_inactivity.monitor', 'Users', 'Monitor Login Inactivity', 'Flag users with this effective permission for inactivity monitoring after more than five business days without a login. This is a monitoring setting, not an access grant.'),
  permission('roles.view', 'Roles & Permissions', 'View Roles', 'View roles, assigned-user counts, and the default permission grants configured for each role.'),
  permission('roles.create', 'Roles & Permissions', 'Create Roles', 'Create new custom roles.'),
  permission('roles.edit', 'Roles & Permissions', 'Edit Roles', 'Rename roles and change ordinary role metadata such as description and active state where allowed.'),
  permission('roles.delete', 'Roles & Permissions', 'Delete Roles', 'Delete eligible custom roles after handling any users still assigned to them.'),
  permission('roles.assign', 'Roles & Permissions', 'Assign Roles', 'Add or remove roles on user accounts, subject to protected-role safeguards.'),
  permission('role_permissions.manage', 'Roles & Permissions', 'Manage Role Permissions', 'Change which permissions are approved by default for a role.'),
  permission('user_permissions.manage', 'Roles & Permissions', 'Manage User Permission Overrides', 'Set or remove per-user Allow or Deny overrides that take precedence over role grants.'),

  permission('huddle.personal.view', 'Virtual Huddle', 'View Own Huddles', 'View only the signed-in user\'s own Virtual Huddle history and eligible personal inbox records.'),
  permission('huddle.send', 'Virtual Huddle', 'Send Virtual Huddles', 'Compose and send Virtual Huddle messages to allowed users or role audiences.'),
  permission('huddle.administration.view', 'Virtual Huddle', 'View Virtual Huddle Administration', 'View the administrative Huddle queue, message history, recipients, and acknowledgment state across users.'),
  permission('huddle.recipients.add', 'Virtual Huddle', 'Add Huddle Recipients', 'Add active users who were missed when an existing Virtual Huddle was originally sent. Existing recipients are not duplicated.'),
  permission('huddle.recipients.revoke', 'Virtual Huddle', 'Revoke Huddle Recipients', 'Remove an eligible recipient\'s outstanding acknowledgment requirement while keeping the Huddle history.'),
  permission('huddle.recipients.require', 'Virtual Huddle', 'Require Huddle Acknowledgment Again', 'Restore a revoked required recipient to Awaiting Confirmation on an existing Virtual Huddle.'),
  permission('huddle.messages.delete', 'Virtual Huddle', 'Delete Huddle Messages', 'Permanently delete eligible Virtual Huddle messages when retention and role safeguards allow it.'),

  permission('audit.login.view', 'Audit', 'View Login Audit', 'View successful user sign-in history by date and user.'),
  permission('audit.user_management.view', 'Audit', 'View Account History', 'View user-account management history, including profile, role, status, setup-link, Tool PIN, and blocked-management events that are recorded.'),
  permission('audit.permissions.view', 'Audit', 'View Permission History', 'View audit history for role changes, role-permission changes, user-role assignments, and per-user permission overrides.'),
  permission('audit.permissions.export', 'Audit', 'Export Permission Audit', 'Reserved for a future Permission Audit export workflow. No current application control uses this permission.'),
  permission('audit.operational.view', 'Audit', 'View Operational Audit', 'Reserved for a future application-facing operational audit view. Current internal validation commands do not use this permission.'),

  permission('tools.unit_api.use', 'API & Tools', 'Use ScanTools and TechTools API', 'Authenticate to and use authorized Unit workflows through ScanTools or TechTools. Tool PIN management is controlled separately.'),
  permission('security.super_admin.manage', 'Security', 'Manage Super Admin', 'Manage protected Super Admin role assignment and the security safeguards specific to Super Admin.')
]);

const PERMISSION_KEYS = Object.freeze(PERMISSIONS.map((item) => item.permissionKey));
const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

function getPermissionDefinition(permissionKey) {
  const normalizedKey = String(permissionKey || '').trim();
  return PERMISSIONS.find((item) => item.permissionKey === normalizedKey) || null;
}

function isKnownPermission(permissionKey) {
  return PERMISSION_KEY_SET.has(String(permissionKey || '').trim());
}

module.exports = {
  PERMISSIONS,
  PERMISSION_KEYS,
  getPermissionDefinition,
  isKnownPermission
};
