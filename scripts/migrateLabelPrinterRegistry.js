'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { LABEL_PRINTERS } = require('../config/labelPrinting');

const APPLY = process.argv.includes('--apply');

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0]?.COLUMN_TYPE || null;
}


async function getColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}

async function countRows(connection, tableName) {
  if (!await tableExists(connection, tableName)) return 0;
  const [[row]] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${tableName}\``);
  return Number(row?.row_count || 0);
}

async function inspect(connection) {
  const blockingIssues = [];
  const operations = [];
  const tables = {};
  for (const dependency of ['users', 'label_library_audit_events']) {
    if (!await tableExists(connection, dependency)) blockingIssues.push(`Missing required dependency table: ${dependency}.`);
  }
  const userIdType = blockingIssues.length ? null : await getColumnType(connection, 'users', 'user_id');
  if (!userIdType) blockingIssues.push('Could not resolve users.user_id type.');

  const requiredColumns = {
    label_printers: ['label_printer_id', 'scope_code', 'owner_user_id', 'display_name', 'host_address', 'port', 'protocol_code', 'cups_queue_name', 'is_shared', 'is_enabled', 'lifetime_print_count', 'last_probe_status'],
    label_printer_groups: ['label_printer_group_id', 'name', 'description', 'is_active'],
    label_printer_group_members: ['label_printer_group_member_id', 'group_id', 'printer_id', 'sort_order', 'is_active']
  };
  for (const table of ['label_printers', 'label_printer_groups', 'label_printer_group_members']) {
    tables[table] = {
      exists: blockingIssues.length === 0 && await tableExists(connection, table),
      rowCount: 0
    };
    if (!tables[table].exists && blockingIssues.length === 0) operations.push(`create_table:${table}`);
    if (tables[table].exists) {
      tables[table].rowCount = await countRows(connection, table);
      const columns = await getColumns(connection, table);
      const missing = requiredColumns[table].filter((column) => !columns.has(column));
      if (missing.length) blockingIssues.push(`${table} is missing required columns: ${missing.join(', ')}.`);
    }
  }

  let currentPrinter = null;
  if (tables.label_printers.exists) {
    const configured = LABEL_PRINTERS[0];
    const [rows] = await connection.query(
      `SELECT label_printer_id, display_name, host_address, port, protocol_code, cups_queue_name
       FROM label_printers WHERE cups_queue_name = ? LIMIT 1`,
      [configured.queue]
    );
    currentPrinter = rows[0] || null;
    if (!currentPrinter) operations.push('register_current_cups_printer');
  } else if (!blockingIssues.length) {
    operations.push('register_current_cups_printer');
  }

  return { blockingIssues, operations, tables, userIdType, currentPrinter };
}

function printReport(state, mode) {
  const configured = LABEL_PRINTERS[0];
  console.log(`\nStage 10W87 Label Printer Registry (${mode})`);
  console.log(`Current production queue: ${configured.label} -> ${configured.queue}`);
  console.log(`Current endpoint metadata: ${configured.protocolCode}://${configured.host}:${configured.port}`);
  for (const [table, info] of Object.entries(state.tables)) {
    console.log(`${table}: ${info.exists ? `present (${info.rowCount} row(s))` : 'not installed'}`);
  }
  console.log(`Current CUPS printer registry row: ${state.currentPrinter ? `present (printer ${state.currentPrinter.label_printer_id})` : 'not registered'}`);
  if (state.blockingIssues.length) {
    console.log('\nBlocking issues:');
    state.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
  }
  if (state.operations.length) {
    console.log('\nPending operations:');
    state.operations.forEach((operation) => console.log(`- ${operation}`));
  } else if (!state.blockingIssues.length) {
    console.log('\nPrinter registry foundation is installed and current.');
  }
}

async function applyMigration(connection, state) {
  if (state.blockingIssues.length) throw new Error('Refusing to apply while blocking issues remain.');
  const userIdType = state.userIdType;
  await connection.beginTransaction();
  try {
    if (!state.tables.label_printers.exists) {
      await connection.query(`CREATE TABLE label_printers (
        label_printer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        scope_code VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        owner_user_id ${userIdType} NULL,
        display_name VARCHAR(120) NOT NULL,
        location_label VARCHAR(160) NULL,
        host_address VARCHAR(255) NOT NULL,
        port SMALLINT UNSIGNED NOT NULL DEFAULT 9100,
        protocol_code VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'raw_9100',
        cups_queue_name VARCHAR(128) NULL,
        manufacturer VARCHAR(80) NULL,
        model VARCHAR(120) NULL,
        detected_description VARCHAR(255) NULL,
        printer_profile_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
        media_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
        dpi SMALLINT UNSIGNED NULL,
        is_shared TINYINT(1) NOT NULL DEFAULT 0,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        lifetime_print_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
        last_used_at DATETIME(6) NULL,
        last_probe_at DATETIME(6) NULL,
        last_probe_status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
        last_probe_details_json JSON NULL,
        created_by_user_id ${userIdType} NULL,
        updated_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_printer_id),
        UNIQUE KEY uniq_label_printer_endpoint (host_address, port, protocol_code),
        KEY idx_label_printers_scope_owner (scope_code, owner_user_id, is_enabled),
        KEY idx_label_printers_shared (is_shared, is_enabled),
        KEY idx_label_printers_queue (cups_queue_name),
        CONSTRAINT fk_label_printers_owner FOREIGN KEY (owner_user_id)
          REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_label_printers_created_by FOREIGN KEY (created_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_printers_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!state.tables.label_printer_groups.exists) {
      await connection.query(`CREATE TABLE label_printer_groups (
        label_printer_group_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(120) NOT NULL,
        description VARCHAR(500) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by_user_id ${userIdType} NULL,
        updated_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_printer_group_id),
        UNIQUE KEY uniq_label_printer_group_name (name),
        CONSTRAINT fk_label_printer_groups_created_by FOREIGN KEY (created_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_printer_groups_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!state.tables.label_printer_group_members.exists) {
      await connection.query(`CREATE TABLE label_printer_group_members (
        label_printer_group_member_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        group_id BIGINT UNSIGNED NOT NULL,
        printer_id BIGINT UNSIGNED NOT NULL,
        sort_order INT UNSIGNED NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        added_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_printer_group_member_id),
        UNIQUE KEY uniq_label_printer_group_member (group_id, printer_id),
        KEY idx_label_printer_group_members_printer (printer_id, is_active),
        CONSTRAINT fk_label_printer_group_members_group FOREIGN KEY (group_id)
          REFERENCES label_printer_groups(label_printer_group_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_label_printer_group_members_printer FOREIGN KEY (printer_id)
          REFERENCES label_printers(label_printer_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_label_printer_group_members_added_by FOREIGN KEY (added_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    const configured = LABEL_PRINTERS[0];
    await connection.query(
      `INSERT INTO label_printers
        (scope_code, owner_user_id, display_name, location_label, host_address, port,
         protocol_code, cups_queue_name, manufacturer, model, printer_profile_code,
         media_code, dpi, is_shared, is_enabled, last_probe_status)
       VALUES ('managed', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'configured')
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name), location_label = VALUES(location_label),
         cups_queue_name = VALUES(cups_queue_name), manufacturer = VALUES(manufacturer),
         model = VALUES(model), printer_profile_code = VALUES(printer_profile_code),
         media_code = VALUES(media_code), dpi = VALUES(dpi)`,
      [
        configured.name || configured.label, configured.location || null,
        configured.host, configured.port, configured.protocolCode,
        configured.queue, configured.manufacturer || null, configured.model || null,
        configured.printerProfileCode || null, configured.mediaCode || null, configured.dpi || null
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const pre = await inspect(connection);
    printReport(pre, APPLY ? 'pre-apply' : 'dry-run');
    if (pre.blockingIssues.length) { process.exitCode = 1; return; }
    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
      return;
    }
    await applyMigration(connection, pre);
    const post = await inspect(connection);
    printReport(post, 'post-apply');
    if (post.blockingIssues.length || post.operations.length) throw new Error('Printer registry verification failed after apply.');
    console.log('\nStage 10W87 Label Printer Registry applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
