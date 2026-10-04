'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('productivity inclusion is a dedicated assignable permission with no built-in role grant',()=>{
 const catalog=read('config/permissionCatalog.js'); const bootstrap=read('config/legacyPermissionBootstrap.js');
 assert.match(catalog,/dashboards\.productivity\.count[\s\S]*Count User in Productivity Metrics/);
 assert.match(bootstrap,/dashboards\.productivity\.count/);
 const techBlock=bootstrap.slice(bootstrap.indexOf('const TECH_GRANTS'),bootstrap.indexOf('const QC_GRANTS'));
 assert.doesNotMatch(techBlock,/dashboards\.productivity\.count/);
 assert.match(bootstrap,/super_admin: Object\.freeze\(PERMISSION_KEYS\.filter\(\(permissionKey\) => permissionKey !== 'dashboards\.productivity\.count'\)\)/);
});

test('dashboard metric calculations and user lists are filtered by effective productivity eligibility',()=>{
 const model=read('models/dashboardModel.js');
 assert.match(model,/PRODUCTIVITY_METRICS_PERMISSION_KEY = 'dashboards\.productivity\.count'/);
 assert.match(model,/INNER JOIN user_permission_overrides upo[\s\S]*upo\.effect = 'allow'/);
 assert.doesNotMatch(model.slice(model.indexOf('async function getProductivityMetricsEligibleUserIds'),model.indexOf('function padTwo')),/role_permissions|user_roles/);
 assert.match(model,/getCompletionSummaryForWindow\(window, eligibleUserIds/);
 assert.match(model,/getCompletionCategoryBreakdown\(window, eligibleUserIds/);
 assert.match(model,/getCompletionLotBreakdown\(window, eligibleUserIds/);
 assert.match(model,/getTechActivitySummary\(safeFilters, safeTimeZone, eligibleUserIds\)/);
 assert.match(model,/getTechDashboardData\(safeFilters, context, eligibleUserIds\)/);
 assert.match(model,/getTechUserFilterOptions\(eligibleUserIds\)/);
 assert.match(model,/FROM users[\s\S]*LEFT JOIN unit_work_completions uwc[\s\S]*COUNT\(\*\) AS completed_count/);
});

test('productivity eligibility does not alter unrelated Unit Stats queries',()=>{
 const model=read('models/dashboardModel.js');
 const start=model.indexOf('async function getUnitStats');
 const end=model.indexOf('async function getLotStats',start);
 const block=model.slice(start,end);
 assert.doesNotMatch(block,/eligibleFilter|eligibleUserIds|dashboards\.productivity\.count/);
});

test('individual Tech metrics fail closed when a requested user is not eligible',()=>{
 const model=read('models/dashboardModel.js');
 assert.match(model,/requestedTech[\s\S]*techUsers\.find\(\(tech\) => tech\.userId === requestedTechId\) \|\| null/);
 assert.match(model,/!normalizeUserIdList\(eligibleUserIds\)\.includes\(Number\(userId\)\)/);
 assert.match(model,/currentUserEligible \? currentUserId : null/);
});

test('Tech selector auto-submits the existing HTMX reporting form on selection',()=>{
 const view=read('views/fragments/tech-dashboard-productivity.ejs'); const js=read('public/js/management-reporting-controls.js');
 assert.match(view,/data-tech-dashboard-user-select/);
 assert.match(js,/matches\('\[data-tech-dashboard-user-select\]'\)[\s\S]*form\.requestSubmit\(\)/);
});

test('migration preserves current contributors as user-specific allows without role grants',()=>{
 const migration=read('scripts/migrateProductivityMetricsEligibilityPermission.js');
 assert.match(migration,/SELECT DISTINCT completed_by_user_id AS user_id/);
 assert.match(migration,/shouldSeedHistoricalContributors = !before\.permission/);
 assert.match(migration,/INSERT IGNORE INTO user_permission_overrides[\s\S]*'allow'/);
 assert.match(migration,/DELETE FROM role_permissions WHERE role_id = \? AND permission_id = \?/);
 assert.doesNotMatch(migration,/INSERT IGNORE INTO role_permissions/);
});


test('productivity eligibility is hidden from role assignment and remains user-editable',()=>{
 const policy=read('services/permissionManagementPolicy.js'); const service=read('services/permissionManagementService.js'); const controller=read('controllers/permissionManagementController.js'); const modal=read('views/fragments/permission-user-manage-modal.ejs');
 assert.match(policy,/USER_ONLY_PERMISSION_KEYS = new Set\(\['dashboards\.productivity\.count'\]\)/);
 assert.match(service,/assertRoleAssignablePermissionKeys\(safePermissionKeys\)/);
 assert.match(controller,/catalog\.filter\(\(permission\) => !isUserOnlyPermissionKey\(permission\.permission_key\)\)/);
 assert.match(modal,/userOnly = permission\.permission_key === 'dashboards\.productivity\.count'/);
 assert.match(modal,/Role permissions cannot enable this setting/);
});
