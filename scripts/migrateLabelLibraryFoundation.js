'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  inspectLabelLibraryStorage,
  ensureLabelLibraryStorage,
  getLabelLibraryStoragePaths
} = require('../services/labelAssetStorage');

const APPLY = process.argv.includes('--apply');

async function tableExists(connection, tableName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(row?.row_count || 0) === 1;
}

async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] ? String(rows[0].COLUMN_TYPE) : null;
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}

async function getIndexes(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT DISTINCT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.INDEX_NAME)));
}

async function getForeignKeys(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT
       kcu.CONSTRAINT_NAME,
       kcu.COLUMN_NAME,
       kcu.REFERENCED_TABLE_NAME,
       kcu.REFERENCED_COLUMN_NAME,
       rc.DELETE_RULE,
       rc.UPDATE_RULE
     FROM information_schema.KEY_COLUMN_USAGE kcu
     INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.TABLE_NAME = kcu.TABLE_NAME
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND kcu.TABLE_NAME = ?
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
    [tableName]
  );
  return rows;
}

async function countRows(connection, tableName) {
  if (!await tableExists(connection, tableName)) return 0;
  const [[row]] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${tableName}\``);
  return Number(row?.row_count || 0);
}

function buildTableDefinitions({ userIdType, lotIdType, unitIdType }) {
  return Object.freeze({
    label_templates: {
      requiredColumns: [
        'label_template_id', 'name', 'description', 'category_code', 'print_scope', 'status',
        'cloned_from_template_id', 'printer_profile_code', 'media_code', 'dpi',
        'canvas_width_dots', 'canvas_height_dots', 'printable_width_dots',
        'horizontal_offset_dots', 'feed_margin_dots', 'revision',
        'activated_at', 'archived_at', 'new_until', 'last_used_at', 'print_count', 'library_sort_order',
        'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at'
      ],
      requiredIndexes: [
        'PRIMARY', 'idx_label_templates_status_category', 'idx_label_templates_print_scope_status', 'idx_label_templates_new_until',
        'idx_label_templates_popularity', 'idx_label_templates_library_order'
      ],
      requiredForeignKeys: {
        fk_label_templates_clone: ['cloned_from_template_id', 'label_templates', 'label_template_id', 'SET NULL', 'CASCADE'],
        fk_label_templates_created_by: ['created_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE'],
        fk_label_templates_updated_by: ['updated_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE label_templates (
        label_template_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(160) NOT NULL,
        description VARCHAR(1000) NULL,
        category_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        print_scope VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'lot',
        status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
        cloned_from_template_id BIGINT UNSIGNED NULL,
        printer_profile_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
        media_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
        dpi SMALLINT UNSIGNED NULL,
        canvas_width_dots SMALLINT UNSIGNED NULL,
        canvas_height_dots INT UNSIGNED NULL,
        printable_width_dots SMALLINT UNSIGNED NULL,
        horizontal_offset_dots SMALLINT NULL,
        feed_margin_dots SMALLINT UNSIGNED NULL,
        revision INT UNSIGNED NOT NULL DEFAULT 1,
        activated_at DATETIME(6) NULL,
        archived_at DATETIME(6) NULL,
        new_until DATETIME(6) NULL,
        last_used_at DATETIME(6) NULL,
        print_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
        library_sort_order INT UNSIGNED NOT NULL DEFAULT 0,
        created_by_user_id ${userIdType} NULL,
        updated_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_template_id),
        KEY idx_label_templates_status_category (status, category_code, name),
        KEY idx_label_templates_print_scope_status (print_scope, status, name),
        KEY idx_label_templates_new_until (new_until),
        KEY idx_label_templates_popularity (print_count, last_used_at),
        KEY idx_label_templates_library_order (library_sort_order, label_template_id),
        KEY idx_label_templates_clone (cloned_from_template_id),
        KEY idx_label_templates_created_by (created_by_user_id),
        KEY idx_label_templates_updated_by (updated_by_user_id),
        CONSTRAINT fk_label_templates_clone FOREIGN KEY (cloned_from_template_id)
          REFERENCES label_templates(label_template_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_templates_created_by FOREIGN KEY (created_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_templates_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    label_assets: {
      requiredColumns: [
        'asset_id', 'name', 'asset_kind', 'status', 'sha256', 'storage_relative_path',
        'mime_type', 'byte_size', 'width_pixels', 'height_pixels', 'has_transparency',
        'source_filename', 'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at'
      ],
      requiredIndexes: ['PRIMARY', 'uniq_label_assets_sha256', 'idx_label_assets_kind_status'],
      requiredForeignKeys: {
        fk_label_assets_created_by: ['created_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE'],
        fk_label_assets_updated_by: ['updated_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE label_assets (
        asset_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(160) NULL,
        asset_kind VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
        sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        storage_relative_path VARCHAR(500) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        mime_type VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        byte_size BIGINT UNSIGNED NOT NULL,
        width_pixels INT UNSIGNED NULL,
        height_pixels INT UNSIGNED NULL,
        has_transparency TINYINT(1) NULL,
        source_filename VARCHAR(255) NULL,
        created_by_user_id ${userIdType} NULL,
        updated_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (asset_id),
        UNIQUE KEY uniq_label_assets_sha256 (sha256),
        KEY idx_label_assets_kind_status (asset_kind, status, name),
        KEY idx_label_assets_created_by (created_by_user_id),
        KEY idx_label_assets_updated_by (updated_by_user_id),
        CONSTRAINT fk_label_assets_created_by FOREIGN KEY (created_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_assets_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    label_template_asset_links: {
      requiredColumns: [
        'label_template_asset_link_id', 'label_template_id', 'asset_id', 'asset_key',
        'role', 'sort_order', 'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at'
      ],
      requiredIndexes: ['PRIMARY', 'uniq_label_template_asset_key', 'idx_label_template_asset_links_asset'],
      requiredForeignKeys: {
        fk_label_template_asset_links_template: ['label_template_id', 'label_templates', 'label_template_id', 'CASCADE', 'CASCADE'],
        fk_label_template_asset_links_asset: ['asset_id', 'label_assets', 'asset_id', 'RESTRICT', 'CASCADE'],
        fk_label_template_asset_links_created_by: ['created_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE'],
        fk_label_template_asset_links_updated_by: ['updated_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE label_template_asset_links (
        label_template_asset_link_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        label_template_id BIGINT UNSIGNED NOT NULL,
        asset_id BIGINT UNSIGNED NOT NULL,
        asset_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        role VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        sort_order INT UNSIGNED NOT NULL DEFAULT 10,
        created_by_user_id ${userIdType} NULL,
        updated_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_template_asset_link_id),
        UNIQUE KEY uniq_label_template_asset_key (label_template_id, asset_key),
        KEY idx_label_template_asset_links_asset (asset_id),
        KEY idx_label_template_asset_links_created_by (created_by_user_id),
        KEY idx_label_template_asset_links_updated_by (updated_by_user_id),
        CONSTRAINT fk_label_template_asset_links_template FOREIGN KEY (label_template_id)
          REFERENCES label_templates(label_template_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_label_template_asset_links_asset FOREIGN KEY (asset_id)
          REFERENCES label_assets(asset_id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_label_template_asset_links_created_by FOREIGN KEY (created_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_template_asset_links_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    lot_label_template_sets: {
      requiredColumns: ['lot_id', 'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at'],
      requiredIndexes: ['PRIMARY'],
      requiredForeignKeys: {
        fk_lot_label_template_sets_lot: ['lot_id', 'lots', 'lot_id', 'CASCADE', 'CASCADE'],
        fk_lot_label_template_sets_created_by: ['created_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE'],
        fk_lot_label_template_sets_updated_by: ['updated_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE lot_label_template_sets (
        lot_id ${lotIdType} NOT NULL,
        created_by_user_id ${userIdType} NULL,
        updated_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (lot_id),
        KEY idx_lot_label_template_sets_created_by (created_by_user_id),
        KEY idx_lot_label_template_sets_updated_by (updated_by_user_id),
        CONSTRAINT fk_lot_label_template_sets_lot FOREIGN KEY (lot_id)
          REFERENCES lots(lot_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_lot_label_template_sets_created_by FOREIGN KEY (created_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_lot_label_template_sets_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    lot_label_templates: {
      requiredColumns: [
        'lot_label_template_id', 'lot_id', 'label_template_id', 'is_required',
        'default_quantity', 'sort_order', 'is_active', 'created_by_user_id',
        'updated_by_user_id', 'created_at', 'updated_at'
      ],
      requiredIndexes: ['PRIMARY', 'uniq_lot_label_template', 'idx_lot_label_templates_template'],
      requiredForeignKeys: {
        fk_lot_label_templates_set: ['lot_id', 'lot_label_template_sets', 'lot_id', 'CASCADE', 'CASCADE'],
        fk_lot_label_templates_template: ['label_template_id', 'label_templates', 'label_template_id', 'CASCADE', 'CASCADE'],
        fk_lot_label_templates_created_by: ['created_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE'],
        fk_lot_label_templates_updated_by: ['updated_by_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE lot_label_templates (
        lot_label_template_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        lot_id ${lotIdType} NOT NULL,
        label_template_id BIGINT UNSIGNED NOT NULL,
        is_required TINYINT(1) NOT NULL DEFAULT 1,
        default_quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        sort_order INT UNSIGNED NOT NULL DEFAULT 10,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by_user_id ${userIdType} NULL,
        updated_by_user_id ${userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (lot_label_template_id),
        UNIQUE KEY uniq_lot_label_template (lot_id, label_template_id),
        KEY idx_lot_label_templates_template (label_template_id, is_active),
        KEY idx_lot_label_templates_created_by (created_by_user_id),
        KEY idx_lot_label_templates_updated_by (updated_by_user_id),
        CONSTRAINT fk_lot_label_templates_set FOREIGN KEY (lot_id)
          REFERENCES lot_label_template_sets(lot_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_lot_label_templates_template FOREIGN KEY (label_template_id)
          REFERENCES label_templates(label_template_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_lot_label_templates_created_by FOREIGN KEY (created_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_lot_label_templates_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    label_print_sets: {
      requiredColumns: [
        'label_print_set_id', 'actor_user_id', 'grouping_kind', 'started_at',
        'last_activity_at', 'created_at'
      ],
      requiredIndexes: ['PRIMARY', 'idx_label_print_sets_actor_activity'],
      requiredForeignKeys: {
        fk_label_print_sets_actor: ['actor_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE label_print_sets (
        label_print_set_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_user_id ${userIdType} NULL,
        grouping_kind VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'auto',
        started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        last_activity_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_print_set_id),
        KEY idx_label_print_sets_actor_activity (actor_user_id, last_activity_at),
        CONSTRAINT fk_label_print_sets_actor FOREIGN KEY (actor_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    label_print_jobs: {
      requiredColumns: [
        'label_print_job_id', 'label_print_set_id', 'actor_user_id', 'source',
        'status', 'requested_at', 'finished_at', 'failure_message', 'created_at', 'updated_at'
      ],
      requiredIndexes: ['PRIMARY', 'idx_label_print_jobs_set', 'idx_label_print_jobs_actor_requested'],
      requiredForeignKeys: {
        fk_label_print_jobs_set: ['label_print_set_id', 'label_print_sets', 'label_print_set_id', 'SET NULL', 'CASCADE'],
        fk_label_print_jobs_actor: ['actor_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE label_print_jobs (
        label_print_job_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        label_print_set_id BIGINT UNSIGNED NULL,
        actor_user_id ${userIdType} NULL,
        source VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'single',
        status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'preparing',
        requested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        finished_at DATETIME(6) NULL,
        failure_message TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_print_job_id),
        KEY idx_label_print_jobs_set (label_print_set_id, requested_at),
        KEY idx_label_print_jobs_actor_requested (actor_user_id, requested_at),
        CONSTRAINT fk_label_print_jobs_set FOREIGN KEY (label_print_set_id)
          REFERENCES label_print_sets(label_print_set_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_print_jobs_actor FOREIGN KEY (actor_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    label_print_job_items: {
      requiredColumns: [
        'label_print_job_item_id', 'label_print_job_id', 'unit_id', 'lot_id',
        'label_template_id', 'unit_label_snapshot', 'lot_name_snapshot',
        'template_id_snapshot', 'template_name_snapshot', 'template_category_snapshot',
        'template_revision_snapshot', 'config_sha256_snapshot', 'copies_requested',
        'copies_queued', 'status', 'failure_message', 'created_at', 'updated_at'
      ],
      requiredIndexes: ['PRIMARY', 'idx_label_print_job_items_job', 'idx_label_print_job_items_unit'],
      requiredForeignKeys: {
        fk_label_print_job_items_job: ['label_print_job_id', 'label_print_jobs', 'label_print_job_id', 'CASCADE', 'CASCADE'],
        fk_label_print_job_items_unit: ['unit_id', 'units', 'unit_id', 'SET NULL', 'CASCADE'],
        fk_label_print_job_items_lot: ['lot_id', 'lots', 'lot_id', 'SET NULL', 'CASCADE'],
        fk_label_print_job_items_template: ['label_template_id', 'label_templates', 'label_template_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE label_print_job_items (
        label_print_job_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        label_print_job_id BIGINT UNSIGNED NOT NULL,
        unit_id ${unitIdType} NULL,
        lot_id ${lotIdType} NULL,
        label_template_id BIGINT UNSIGNED NULL,
        unit_label_snapshot VARCHAR(191) NULL,
        lot_name_snapshot VARCHAR(191) NULL,
        template_id_snapshot BIGINT UNSIGNED NULL,
        template_name_snapshot VARCHAR(160) NOT NULL,
        template_category_snapshot VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
        template_revision_snapshot INT UNSIGNED NULL,
        config_sha256_snapshot CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
        copies_requested SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        copies_queued SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'preparing',
        failure_message TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_print_job_item_id),
        KEY idx_label_print_job_items_job (label_print_job_id, label_print_job_item_id),
        KEY idx_label_print_job_items_unit (unit_id, created_at),
        KEY idx_label_print_job_items_lot (lot_id, created_at),
        KEY idx_label_print_job_items_template (label_template_id, created_at),
        CONSTRAINT fk_label_print_job_items_job FOREIGN KEY (label_print_job_id)
          REFERENCES label_print_jobs(label_print_job_id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_label_print_job_items_unit FOREIGN KEY (unit_id)
          REFERENCES units(unit_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_print_job_items_lot FOREIGN KEY (lot_id)
          REFERENCES lots(lot_id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_label_print_job_items_template FOREIGN KEY (label_template_id)
          REFERENCES label_templates(label_template_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    label_print_attempts: {
      requiredColumns: [
        'label_print_attempt_id', 'label_print_job_item_id', 'attempt_number',
        'printer_key_snapshot', 'printer_label_snapshot', 'printer_location_snapshot',
        'cups_queue_snapshot', 'protocol_snapshot', 'endpoint_snapshot', 'copies_submitted',
        'cups_job_ids_json', 'status', 'started_at', 'finished_at', 'failure_message', 'created_at'
      ],
      requiredIndexes: ['PRIMARY', 'uniq_label_print_attempt_number', 'idx_label_print_attempts_status'],
      requiredForeignKeys: {
        fk_label_print_attempts_item: ['label_print_job_item_id', 'label_print_job_items', 'label_print_job_item_id', 'CASCADE', 'CASCADE']
      },
      ddl: `CREATE TABLE label_print_attempts (
        label_print_attempt_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        label_print_job_item_id BIGINT UNSIGNED NOT NULL,
        attempt_number SMALLINT UNSIGNED NOT NULL,
        printer_key_snapshot VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,
        printer_label_snapshot VARCHAR(160) NULL,
        printer_location_snapshot VARCHAR(160) NULL,
        cups_queue_snapshot VARCHAR(160) NULL,
        protocol_snapshot VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
        endpoint_snapshot VARCHAR(255) NULL,
        copies_submitted SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        cups_job_ids_json JSON NULL,
        status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'preparing',
        started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        finished_at DATETIME(6) NULL,
        failure_message TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_print_attempt_id),
        UNIQUE KEY uniq_label_print_attempt_number (label_print_job_item_id, attempt_number),
        KEY idx_label_print_attempts_status (status, started_at),
        CONSTRAINT fk_label_print_attempts_item FOREIGN KEY (label_print_job_item_id)
          REFERENCES label_print_job_items(label_print_job_item_id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    },
    label_library_audit_events: {
      requiredColumns: [
        'label_library_audit_event_id', 'actor_user_id', 'event_type', 'entity_type',
        'entity_id', 'entity_name_snapshot', 'details_json', 'created_at'
      ],
      requiredIndexes: ['PRIMARY', 'idx_label_library_audit_entity', 'idx_label_library_audit_actor'],
      requiredForeignKeys: {
        fk_label_library_audit_actor: ['actor_user_id', 'users', 'user_id', 'SET NULL', 'CASCADE']
      },
      ddl: `CREATE TABLE label_library_audit_events (
        label_library_audit_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_user_id ${userIdType} NULL,
        event_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        entity_type VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        entity_id BIGINT UNSIGNED NULL,
        entity_name_snapshot VARCHAR(160) NULL,
        details_json JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_library_audit_event_id),
        KEY idx_label_library_audit_entity (entity_type, entity_id, created_at),
        KEY idx_label_library_audit_actor (actor_user_id, created_at),
        CONSTRAINT fk_label_library_audit_actor FOREIGN KEY (actor_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    }
  });
}

function assertForeignKeys(tableName, actualRows, expectedMap, blockingIssues) {
  const byName = new Map(actualRows.map((row) => [String(row.CONSTRAINT_NAME), row]));

  for (const [constraintName, expected] of Object.entries(expectedMap || {})) {
    const row = byName.get(constraintName);
    const [columnName, referencedTable, referencedColumn, deleteRule, updateRule] = expected;
    if (!row
      || String(row.COLUMN_NAME) !== columnName
      || String(row.REFERENCED_TABLE_NAME) !== referencedTable
      || String(row.REFERENCED_COLUMN_NAME) !== referencedColumn
      || String(row.DELETE_RULE).toUpperCase() !== deleteRule
      || String(row.UPDATE_RULE).toUpperCase() !== updateRule) {
      blockingIssues.push(`${tableName} has an incompatible or missing ${constraintName} foreign key.`);
    }
  }
}

async function inspect(connection) {
  const blockingIssues = [];
  const operations = [];
  const tables = {};

  for (const dependency of ['users', 'lots', 'units']) {
    if (!await tableExists(connection, dependency)) {
      blockingIssues.push(`Missing required dependency table: ${dependency}.`);
    }
  }

  if (blockingIssues.length) {
    return { blockingIssues, operations, tables, idTypes: {}, storage: await inspectLabelLibraryStorage() };
  }

  const idTypes = {
    userIdType: await getColumnType(connection, 'users', 'user_id'),
    lotIdType: await getColumnType(connection, 'lots', 'lot_id'),
    unitIdType: await getColumnType(connection, 'units', 'unit_id')
  };

  for (const [name, value] of Object.entries(idTypes)) {
    if (!value) blockingIssues.push(`Could not resolve required database ID type: ${name}.`);
  }

  if (blockingIssues.length) {
    return { blockingIssues, operations, tables, idTypes, storage: await inspectLabelLibraryStorage() };
  }

  const definitions = buildTableDefinitions(idTypes);

  for (const [tableName, definition] of Object.entries(definitions)) {
    const exists = await tableExists(connection, tableName);
    tables[tableName] = { exists, rowCount: exists ? await countRows(connection, tableName) : 0 };

    if (!exists) {
      operations.push({ kind: 'create_table', tableName, ddl: definition.ddl });
      continue;
    }

    const [columns, indexes, foreignKeys] = await Promise.all([
      getColumns(connection, tableName),
      getIndexes(connection, tableName),
      getForeignKeys(connection, tableName)
    ]);

    const missingColumns = definition.requiredColumns.filter((columnName) => !columns.has(columnName));
    if (missingColumns.length) {
      blockingIssues.push(`${tableName} exists but is missing required columns: ${missingColumns.join(', ')}.`);
    }

    const missingIndexes = definition.requiredIndexes.filter((indexName) => !indexes.has(indexName));
    if (missingIndexes.length) {
      blockingIssues.push(`${tableName} exists but is missing required indexes: ${missingIndexes.join(', ')}.`);
    }

    assertForeignKeys(tableName, foreignKeys, definition.requiredForeignKeys, blockingIssues);
  }

  return {
    blockingIssues,
    operations,
    tables,
    idTypes,
    storage: await inspectLabelLibraryStorage()
  };
}

function printReport(report, mode) {
  const storagePaths = getLabelLibraryStoragePaths();
  console.log(`\nStage 10W82 Label Library foundation (${mode})`);
  console.log(`Storage root: ${storagePaths.root}`);
  console.log(`Storage directory: ${report.storage.root.exists ? 'present' : 'not created yet'}`);
  console.log(`users.user_id: ${report.idTypes.userIdType || 'unresolved'}`);
  console.log(`lots.lot_id: ${report.idTypes.lotIdType || 'unresolved'}`);
  console.log(`units.unit_id: ${report.idTypes.unitIdType || 'unresolved'}`);

  for (const [tableName, state] of Object.entries(report.tables)) {
    console.log(`${tableName}: ${state.exists ? `present (${state.rowCount} row(s))` : 'not installed'}`);
  }

  if (report.operations.length) {
    console.log('\nPending schema operations:');
    report.operations.forEach((operation) => console.log(`- ${operation.kind}: ${operation.tableName}`));
  } else if (Object.keys(report.tables).length) {
    console.log('\nLabel Library foundation schema is already installed.');
  }

  if (report.blockingIssues.length) {
    console.log('\nBlocking issues:');
    report.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
  }

  if (!APPLY) {
    console.log('\nNo database or filesystem changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const initial = await inspect(connection);
    printReport(initial, APPLY ? 'pre-apply' : 'dry-run');

    if (initial.blockingIssues.length) {
      throw new Error('Blocking Label Library foundation issues must be resolved before applying.');
    }

    if (!APPLY) return;

    for (const operation of initial.operations) {
      await connection.query(operation.ddl);
    }
    await ensureLabelLibraryStorage();

    const finalState = await inspect(connection);
    if (finalState.blockingIssues.length || finalState.operations.length) {
      throw new Error('Label Library foundation verification failed after apply.');
    }
    if (!finalState.storage.root.exists || !finalState.storage.assets.exists || !finalState.storage.temp.exists) {
      throw new Error('Label Library filesystem storage was not created successfully.');
    }

    printReport(finalState, 'post-apply');
    console.log('\nStage 10W82 Label Library foundation applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.stack || error.message || error);
  try {
    await pool.end();
  } catch (_) {}
  process.exitCode = 1;
});
