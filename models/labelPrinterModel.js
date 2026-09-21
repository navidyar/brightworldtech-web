'use strict';

const { pool } = require('./db');
const { writeAuditEvent } = require('./labelLibraryModel');
const { canJoinPrinterGroup } = require('../services/labelPrinterPolicy');

function positiveInteger(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer.`);
  return n;
}

async function listPrinters({ includeDisabled = true } = {}, connection = pool) {
  const where = includeDisabled ? '' : 'WHERE printer.is_enabled = 1';
  const [rows] = await connection.query(`
    SELECT
      printer.*,
      owner.username AS owner_username,
      owner.first_name AS owner_first_name,
      owner.last_name AS owner_last_name,
      COALESCE(group_counts.group_count, 0) AS group_count
    FROM label_printers printer
    LEFT JOIN users owner ON owner.user_id = printer.owner_user_id
    LEFT JOIN (
      SELECT printer_id, COUNT(*) AS group_count
      FROM label_printer_group_members
      WHERE is_active = 1
      GROUP BY printer_id
    ) group_counts ON group_counts.printer_id = printer.label_printer_id
    ${where}
    ORDER BY printer.scope_code, printer.display_name, printer.label_printer_id
  `);
  return rows;
}

async function getPrinterById(printerId, connection = pool) {
  const id = positiveInteger(printerId, 'Printer ID');
  const [rows] = await connection.query(
    `SELECT printer.*, owner.username AS owner_username,
            owner.first_name AS owner_first_name, owner.last_name AS owner_last_name
     FROM label_printers printer
     LEFT JOIN users owner ON owner.user_id = printer.owner_user_id
     WHERE printer.label_printer_id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}



async function getPrintersByIds(printerIds, connection = pool) {
  const ids = [...new Set((Array.isArray(printerIds) ? printerIds : [printerIds])
    .map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  const [rows] = await connection.query(
    `SELECT printer.*, owner.username AS owner_username
     FROM label_printers printer
     LEFT JOIN users owner ON owner.user_id = printer.owner_user_id
     WHERE printer.label_printer_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return rows;
}

async function findPrinterRegistrationConflict({ hostAddress, cupsQueueName = null, excludePrinterId = null }, connection = pool) {
  const host = String(hostAddress || '').trim();
  const queue = String(cupsQueueName || '').trim() || null;
  if (!host && !queue) return null;
  const clauses = [];
  const params = [];
  if (host) {
    clauses.push('printer.host_address = ?');
    params.push(host);
  }
  if (queue) {
    clauses.push('printer.cups_queue_name = ?');
    params.push(queue);
  }
  let sql = `SELECT printer.*, owner.username AS owner_username,
                    owner.first_name AS owner_first_name, owner.last_name AS owner_last_name
             FROM label_printers printer
             LEFT JOIN users owner ON owner.user_id = printer.owner_user_id
             WHERE (${clauses.join(' OR ')})`;
  if (excludePrinterId !== null && excludePrinterId !== undefined && excludePrinterId !== '') {
    sql += ' AND printer.label_printer_id <> ?';
    params.push(positiveInteger(excludePrinterId, 'Printer ID'));
  }
  sql += ' ORDER BY printer.label_printer_id LIMIT 1';
  const [rows] = await connection.query(sql, params);
  return rows[0] || null;
}

async function listAvailablePrintersForUser({ userId, roleCodes = [] }, connection = pool) {
  const id = positiveInteger(userId, 'User ID');
  const isLeadPlus = roleCodes.some((role) => ['admin', 'management', 'tech_lead'].includes(String(role)));
  const [rows] = await connection.query(
    `SELECT printer.*, owner.username AS owner_username
     FROM label_printers printer
     LEFT JOIN users owner ON owner.user_id = printer.owner_user_id
     WHERE printer.is_enabled = 1
       AND (
         printer.scope_code = 'managed'
         OR printer.is_shared = 1
         OR printer.owner_user_id = ?
         OR ? = 1
       )
     ORDER BY
       CASE WHEN printer.owner_user_id = ? THEN 0 WHEN printer.scope_code = 'managed' THEN 1 ELSE 2 END,
       printer.display_name, printer.label_printer_id`,
    [id, isLeadPlus ? 1 : 0, id]
  );
  return rows;
}

async function listOwnedSoloPrinters(userId, connection = pool) {
  const id = positiveInteger(userId, 'User ID');
  const [rows] = await connection.query(
    `SELECT * FROM label_printers
     WHERE scope_code = 'solo' AND owner_user_id = ?
     ORDER BY display_name, label_printer_id`,
    [id]
  );
  return rows;
}

async function createPrinter(data, { actorUserId, ownerUserId = null }, connection = null) {
  const actorId = positiveInteger(actorUserId, 'User ID');
  const owned = !connection;
  const db = connection || await pool.getConnection();
  try {
    if (owned) await db.beginTransaction();
    const [result] = await db.query(
      `INSERT INTO label_printers
        (scope_code, owner_user_id, display_name, location_label, host_address, port,
         protocol_code, cups_queue_name, manufacturer, model, detected_description,
         printer_profile_code, media_code, dpi, is_shared, is_enabled,
         last_probe_at, last_probe_status, last_probe_details_json,
         created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         CURRENT_TIMESTAMP(6), ?, ?, ?, ?)`,
      [
        data.scope,
        data.scope === 'solo' ? positiveInteger(ownerUserId || actorId, 'Owner user ID') : null,
        data.displayName, data.locationLabel, data.hostAddress, data.port,
        data.protocolCode, data.cupsQueueName, data.manufacturer, data.model,
        data.detectedDescription, data.printerProfileCode, data.mediaCode, data.dpi,
        data.isShared ? 1 : 0, data.isEnabled ? 1 : 0,
        data.probeStatus || null,
        data.probeDetails ? JSON.stringify(data.probeDetails) : null,
        actorId, actorId
      ]
    );
    const printerId = Number(result.insertId);
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'printer_created',
      entityType: 'label_printer',
      entityId: printerId,
      entityName: data.displayName,
      details: { scope: data.scope, hostAddress: data.hostAddress, protocolCode: data.protocolCode, isShared: data.isShared }
    }, db);
    const created = await getPrinterById(printerId, db);
    if (owned) await db.commit();
    return created;
  } catch (error) {
    if (owned) await db.rollback();
    throw error;
  } finally {
    if (owned) db.release();
  }
}

async function updatePrinter(printerId, data, { actorUserId }, connection = null) {
  const id = positiveInteger(printerId, 'Printer ID');
  const actorId = positiveInteger(actorUserId, 'User ID');
  const owned = !connection;
  const db = connection || await pool.getConnection();
  try {
    if (owned) await db.beginTransaction();
    const existing = await getPrinterById(id, db);
    if (!existing) return null;
    await db.query(
      `UPDATE label_printers
       SET display_name = ?, location_label = ?, host_address = ?, port = ?, protocol_code = ?,
           cups_queue_name = ?, manufacturer = ?, model = ?, detected_description = ?,
           printer_profile_code = ?, media_code = ?, dpi = ?, is_shared = ?, is_enabled = ?,
           last_probe_at = CURRENT_TIMESTAMP(6), last_probe_status = ?, last_probe_details_json = ?,
           updated_by_user_id = ?
       WHERE label_printer_id = ?`,
      [
        data.displayName, data.locationLabel, data.hostAddress, data.port, data.protocolCode,
        data.cupsQueueName, data.manufacturer, data.model, data.detectedDescription,
        data.printerProfileCode, data.mediaCode, data.dpi,
        data.scope === 'managed' ? 1 : (data.isShared ? 1 : 0), data.isEnabled ? 1 : 0,
        data.probeStatus || existing.last_probe_status || null,
        data.probeDetails ? JSON.stringify(data.probeDetails) : existing.last_probe_details_json,
        actorId, id
      ]
    );
    if (existing.scope_code === 'solo' && !data.isShared) {
      await db.query('DELETE FROM label_printer_group_members WHERE printer_id = ?', [id]);
    }
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'printer_updated',
      entityType: 'label_printer',
      entityId: id,
      entityName: data.displayName,
      details: { hostAddress: data.hostAddress, protocolCode: data.protocolCode, isShared: data.isShared, isEnabled: data.isEnabled }
    }, db);
    const updated = await getPrinterById(id, db);
    if (owned) await db.commit();
    return updated;
  } catch (error) {
    if (owned) await db.rollback();
    throw error;
  } finally {
    if (owned) db.release();
  }
}


async function setSoloPrinterSharing(printerId, isShared, { actorUserId }, connection = null) {
  const id = positiveInteger(printerId, 'Printer ID');
  const actorId = positiveInteger(actorUserId, 'User ID');
  const owned = !connection;
  const db = connection || await pool.getConnection();
  try {
    if (owned) await db.beginTransaction();
    const printer = await getPrinterById(id, db);
    if (!printer) {
      if (owned) await db.rollback();
      return null;
    }
    if (String(printer.scope_code) !== 'solo') throw new Error('Only solo printers have a sharing setting.');
    const shared = Boolean(isShared);
    await db.query(
      `UPDATE label_printers
       SET is_shared = ?, updated_by_user_id = ?
       WHERE label_printer_id = ?`,
      [shared ? 1 : 0, actorId, id]
    );
    if (!shared) {
      await db.query('DELETE FROM label_printer_group_members WHERE printer_id = ?', [id]);
    }
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'printer_sharing_updated',
      entityType: 'label_printer',
      entityId: id,
      entityName: printer.display_name,
      details: { isShared: shared }
    }, db);
    const updated = await getPrinterById(id, db);
    if (owned) await db.commit();
    return updated;
  } catch (error) {
    if (owned) await db.rollback();
    throw error;
  } finally {
    if (owned) db.release();
  }
}

async function convertPrinterScope(printerId, { targetScope, ownerUserId = null, isShared = false }, { actorUserId }, connection = null) {
  const id = positiveInteger(printerId, 'Printer ID');
  const actorId = positiveInteger(actorUserId, 'User ID');
  const scope = String(targetScope || '').trim();
  if (!['managed', 'solo'].includes(scope)) throw new Error('Invalid printer scope.');
  const owned = !connection;
  const db = connection || await pool.getConnection();
  try {
    if (owned) await db.beginTransaction();
    const printer = await getPrinterById(id, db);
    if (!printer) {
      if (owned) await db.rollback();
      return null;
    }
    if (String(printer.scope_code) === scope) {
      if (owned) await db.commit();
      return printer;
    }

    let nextOwnerUserId = printer.owner_user_id ? Number(printer.owner_user_id) : null;
    let nextShared = 1;
    if (scope === 'solo') {
      nextOwnerUserId = positiveInteger(ownerUserId || nextOwnerUserId, 'Owner user ID');
      nextShared = isShared ? 1 : 0;
    }

    await db.query(
      `UPDATE label_printers
       SET scope_code = ?, owner_user_id = ?, is_shared = ?, updated_by_user_id = ?
       WHERE label_printer_id = ?`,
      [scope, nextOwnerUserId, nextShared, actorId, id]
    );
    if (scope === 'solo' && nextShared === 0) {
      await db.query('DELETE FROM label_printer_group_members WHERE printer_id = ?', [id]);
    }
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'printer_scope_converted',
      entityType: 'label_printer',
      entityId: id,
      entityName: printer.display_name,
      details: {
        fromScope: printer.scope_code,
        toScope: scope,
        ownerUserId: nextOwnerUserId,
        isShared: nextShared === 1
      }
    }, db);
    const updated = await getPrinterById(id, db);
    if (owned) await db.commit();
    return updated;
  } catch (error) {
    if (owned) await db.rollback();
    throw error;
  } finally {
    if (owned) db.release();
  }
}

async function deletePrinter(printerId, { actorUserId }, connection = null) {
  const id = positiveInteger(printerId, 'Printer ID');
  const actorId = positiveInteger(actorUserId, 'User ID');
  const owned = !connection;
  const db = connection || await pool.getConnection();
  try {
    if (owned) await db.beginTransaction();
    const printer = await getPrinterById(id, db);
    if (!printer) return null;
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'printer_deleted',
      entityType: 'label_printer',
      entityId: id,
      entityName: printer.display_name,
      details: {
        scope: printer.scope_code,
        ownerUserId: printer.owner_user_id ? Number(printer.owner_user_id) : null,
        hostAddress: printer.host_address,
        cupsQueueName: printer.cups_queue_name
      }
    }, db);
    await db.query('DELETE FROM label_printers WHERE label_printer_id = ?', [id]);
    if (owned) await db.commit();
    return printer;
  } catch (error) {
    if (owned) await db.rollback();
    throw error;
  } finally {
    if (owned) db.release();
  }
}


async function setPrinterCupsQueue(printerId, cupsQueueName, connection = pool) {
  const id = positiveInteger(printerId, 'Printer ID');
  const queue = String(cupsQueueName || '').trim().slice(0, 128) || null;
  await connection.query(
    'UPDATE label_printers SET cups_queue_name = ? WHERE label_printer_id = ?',
    [queue, id]
  );
  return getPrinterById(id, connection);
}

async function recordPrinterProbe(printerId, { status, details = null }, connection = pool) {
  const id = positiveInteger(printerId, 'Printer ID');
  await connection.query(
    `UPDATE label_printers
     SET last_probe_at = CURRENT_TIMESTAMP(6), last_probe_status = ?, last_probe_details_json = ?
     WHERE label_printer_id = ?`,
    [String(status || '').trim().slice(0, 20) || null, details ? JSON.stringify(details) : null, id]
  );
}

async function recordPrinterQueuedCopies(printerId, copies, connection = pool) {
  const id = positiveInteger(printerId, 'Printer ID');
  const safeCopies = Math.max(0, Number(copies) || 0);
  if (!safeCopies) return;
  await connection.query(
    `UPDATE label_printers
     SET lifetime_print_count = lifetime_print_count + ?, last_used_at = CURRENT_TIMESTAMP(6)
     WHERE label_printer_id = ?`,
    [safeCopies, id]
  );
}

async function listGroups(connection = pool) {
  const [rows] = await connection.query(`
    SELECT groupRow.*,
      COALESCE(members.member_count, 0) AS member_count
    FROM label_printer_groups groupRow
    LEFT JOIN (
      SELECT group_id, COUNT(*) AS member_count
      FROM label_printer_group_members WHERE is_active = 1 GROUP BY group_id
    ) members ON members.group_id = groupRow.label_printer_group_id
    ORDER BY groupRow.is_active DESC, groupRow.name, groupRow.label_printer_group_id
  `);
  return rows;
}


async function listRoutingGroupRows(connection = pool) {
  const [rows] = await connection.query(`
    SELECT
      groupRow.label_printer_group_id, groupRow.name AS group_name,
      groupRow.description AS group_description, member.sort_order AS group_sort_order,
      printer.*, owner.username AS owner_username
    FROM label_printer_groups groupRow
    INNER JOIN label_printer_group_members member
      ON member.group_id = groupRow.label_printer_group_id AND member.is_active = 1
    INNER JOIN label_printers printer
      ON printer.label_printer_id = member.printer_id AND printer.is_enabled = 1
    LEFT JOIN users owner ON owner.user_id = printer.owner_user_id
    WHERE groupRow.is_active = 1
    ORDER BY groupRow.name, groupRow.label_printer_group_id, member.sort_order, printer.display_name
  `);
  return rows;
}

async function getGroupById(groupId, connection = pool) {
  const id = positiveInteger(groupId, 'Printer group ID');
  const [rows] = await connection.query(
    'SELECT * FROM label_printer_groups WHERE label_printer_group_id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function createGroup({ name, description = null }, actorUserId) {
  const actorId = positiveInteger(actorUserId, 'User ID');
  const groupName = String(name || '').trim();
  if (!groupName || groupName.length > 120) throw new Error('Printer group name is required and must be 120 characters or fewer.');
  const [result] = await pool.query(
    `INSERT INTO label_printer_groups (name, description, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?)`,
    [groupName, String(description || '').trim().slice(0, 500) || null, actorId, actorId]
  );
  const id = Number(result.insertId);
  await writeAuditEvent({ actorUserId: actorId, eventType: 'printer_group_created', entityType: 'label_printer_group', entityId: id, entityName: groupName });
  return getGroupById(id);
}


async function deleteGroup(groupId, actorUserId, connection = null) {
  const id = positiveInteger(groupId, 'Printer group ID');
  const actorId = positiveInteger(actorUserId, 'User ID');
  const owned = !connection;
  const db = connection || await pool.getConnection();
  try {
    if (owned) await db.beginTransaction();
    const group = await getGroupById(id, db);
    if (!group) {
      if (owned) await db.rollback();
      return null;
    }
    const [memberRows] = await db.query(
      'SELECT COUNT(*) AS member_count FROM label_printer_group_members WHERE group_id = ?',
      [id]
    );
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'printer_group_deleted',
      entityType: 'label_printer_group',
      entityId: id,
      entityName: group.name,
      details: { memberCount: Number(memberRows[0]?.member_count || 0) }
    }, db);
    await db.query('DELETE FROM label_printer_groups WHERE label_printer_group_id = ?', [id]);
    if (owned) await db.commit();
    return group;
  } catch (error) {
    if (owned) await db.rollback();
    throw error;
  } finally {
    if (owned) db.release();
  }
}

async function replaceGroupMembers(groupId, printerIds, actorUserId) {
  const id = positiveInteger(groupId, 'Printer group ID');
  const actorId = positiveInteger(actorUserId, 'User ID');
  const uniqueIds = [...new Set((Array.isArray(printerIds) ? printerIds : [printerIds]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const group = await getGroupById(id, connection);
    if (!group) throw new Error('Printer group not found.');
    let eligible = [];
    if (uniqueIds.length) {
      const [rows] = await connection.query(
        `SELECT * FROM label_printers WHERE label_printer_id IN (${uniqueIds.map(() => '?').join(',')})`,
        uniqueIds
      );
      eligible = rows.filter(canJoinPrinterGroup);
      if (eligible.length !== uniqueIds.length) throw new Error('Private, disabled, or unavailable solo printers cannot be added to a shared printer group.');
    }
    await connection.query('DELETE FROM label_printer_group_members WHERE group_id = ?', [id]);
    for (let index = 0; index < eligible.length; index += 1) {
      await connection.query(
        `INSERT INTO label_printer_group_members
          (group_id, printer_id, sort_order, is_active, added_by_user_id)
         VALUES (?, ?, ?, 1, ?)`,
        [id, eligible[index].label_printer_id, index, actorId]
      );
    }
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'printer_group_members_replaced',
      entityType: 'label_printer_group',
      entityId: id,
      entityName: group.name,
      details: { printerIds: eligible.map((printer) => Number(printer.label_printer_id)) }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listGroupMembers(groupId, connection = pool) {
  const id = positiveInteger(groupId, 'Printer group ID');
  const [rows] = await connection.query(
    `SELECT member.*, printer.display_name, printer.location_label, printer.scope_code,
            printer.is_shared, printer.is_enabled, printer.host_address, printer.protocol_code
     FROM label_printer_group_members member
     INNER JOIN label_printers printer ON printer.label_printer_id = member.printer_id
     WHERE member.group_id = ?
     ORDER BY member.sort_order, printer.display_name`,
    [id]
  );
  return rows;
}

module.exports = {
  listPrinters,
  getPrinterById,
  getPrintersByIds,
  findPrinterRegistrationConflict,
  listAvailablePrintersForUser,
  listOwnedSoloPrinters,
  createPrinter,
  updatePrinter,
  setSoloPrinterSharing,
  convertPrinterScope,
  deletePrinter,
  setPrinterCupsQueue,
  recordPrinterProbe,
  recordPrinterQueuedCopies,
  listGroups,
  listRoutingGroupRows,
  getGroupById,
  createGroup,
  deleteGroup,
  replaceGroupMembers,
  listGroupMembers
};
