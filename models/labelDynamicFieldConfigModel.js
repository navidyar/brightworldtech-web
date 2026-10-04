'use strict';

const { pool } = require('./db');

function isMissingTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146;
}

async function listLabelDynamicFieldSettings() {
  try {
    const [rows] = await pool.query(
      `SELECT field_key, display_label, is_active, sort_order
       FROM label_dynamic_field_config
       ORDER BY sort_order, field_key`
    );
    return rows;
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function saveLabelDynamicFieldSettings(items = []) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    for (const item of items) {
      await connection.query(
        `INSERT INTO label_dynamic_field_config
          (field_key, display_label, is_active, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           display_label = VALUES(display_label),
           is_active = VALUES(is_active),
           sort_order = VALUES(sort_order),
           updated_at = CURRENT_TIMESTAMP`,
        [item.fieldKey, item.displayLabel, item.isActive ? 1 : 0, item.sortOrder]
      );
    }
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { /* preserve original error */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function saveLabelDynamicFieldOrder(items = []) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    for (const item of items) {
      await connection.query(
        `INSERT INTO label_dynamic_field_config
          (field_key, display_label, is_active, sort_order)
         VALUES (?, NULL, 1, ?)
         ON DUPLICATE KEY UPDATE
           sort_order = VALUES(sort_order),
           updated_at = CURRENT_TIMESTAMP`,
        [item.fieldKey, item.sortOrder]
      );
    }
    await connection.commit();
    return { updatedCount: items.length };
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { /* preserve original error */ }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listLabelDynamicFieldSettings,
  saveLabelDynamicFieldSettings,
  saveLabelDynamicFieldOrder
};
