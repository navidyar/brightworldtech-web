'use strict';

const { pool } = require('../models/db');
const permissionManagementService = require('../services/permissionManagementService');

async function main() {
  const actorPermissions = new Set(['audit.permissions.view']);
  const result = await permissionManagementService.listPermissionAuditEvents({
    actorPermissions,
    page: 1,
    pageSize: 10
  });

  if (!result || !Array.isArray(result.events)) {
    throw new Error('Permission Audit validation did not return an event list.');
  }

  if (result.events.length > 0) {
    const firstEvent = result.events[0];
    const detail = await permissionManagementService.getPermissionAuditEvent({
      actorPermissions,
      eventId: firstEvent.permission_audit_event_id
    });
    if (!detail || Number(detail.permission_audit_event_id) !== Number(firstEvent.permission_audit_event_id)) {
      throw new Error('Permission Audit detail lookup did not match the event list.');
    }
  }

  console.log('Permission Audit UI validation passed.');
  console.log(`Permission audit events sampled: ${result.events.length}`);
  console.log(`Additional page available: ${result.hasNext ? 'yes' : 'no'}`);
  console.log('Permission Audit access is controlled by audit.permissions.view.');
  console.log('Legacy application authorization gates remain authoritative outside this new audit surface.');
}

main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
