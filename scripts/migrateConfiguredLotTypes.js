'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

const TARGET_LOT_TYPES = Object.freeze([
  Object.freeze({ label: 'Ready Stock Lot', aliases: ['ready stock lot', 'ready stock'] }),
  Object.freeze({ label: 'As-Is Lot', aliases: ['as-is lot', 'as is lot', 'as-is', 'as is'] }),
  Object.freeze({ label: 'Customer Lot', aliases: ['customer lot'] }),
  Object.freeze({ label: 'ELS Lot', aliases: ['els lot', 'els'] }),
  Object.freeze({ label: 'Configuration Lot', aliases: ['configuration lot'] }),
  Object.freeze({ label: 'Fail Lot', aliases: ['fail lot', 'failed lot'] }),
  Object.freeze({ label: 'Refurbishment Lot', aliases: ['refurbishment lot', 'refurbisher lot', 'refurbish lot'] })
]);

function normalizeLotTypeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function rowMatchesAliases(row, aliases) {
  const accepted = new Set(aliases.map(normalizeLotTypeText));
  return [row.label, row.value, row.name]
    .map(normalizeLotTypeText)
    .some((candidate) => candidate && accepted.has(candidate));
}

function buildLotTypePlan(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const usedIds = new Set();
  const targets = [];
  const ambiguities = [];

  TARGET_LOT_TYPES.forEach((target, index) => {
    const matches = sourceRows.filter((row) => !usedIds.has(Number(row.config_value_id))
      && rowMatchesAliases(row, target.aliases));

    if (matches.length > 1) {
      ambiguities.push({ target: target.label, matches });
      return;
    }

    const match = matches[0] || null;
    if (match) usedIds.add(Number(match.config_value_id));

    targets.push({
      label: target.label,
      sortOrder: (index + 1) * 10,
      existing: match
    });
  });

  const deactivate = sourceRows.filter((row) => (
    Number(row.is_active) === 1 && !usedIds.has(Number(row.config_value_id))
  ));

  return { targets, deactivate, ambiguities };
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
}

async function getLotTypeCategoryId(connection) {
  const [rows] = await connection.query(
    `SELECT config_category_id
       FROM system_config_categories
      WHERE system_config_category_id = ?
      LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.LOT_TYPES]
  );
  const categoryId = Number(rows[0]?.config_category_id || 0);
  if (!categoryId) throw new Error('Lot Types does not have a system configuration category binding.');
  return categoryId;
}

async function loadLotTypeRows(connection, categoryId, valueColumns) {
  const labelSelect = valueColumns.has('label') ? 'label' : valueColumns.has('name') ? 'name AS label' : 'NULL AS label';
  const nameSelect = valueColumns.has('name') ? 'name' : 'NULL AS name';
  const valueSelect = valueColumns.has('value') ? 'value' : 'NULL AS value';
  const activeSelect = valueColumns.has('is_active') ? 'is_active' : '1 AS is_active';
  const sortSelect = valueColumns.has('sort_order') ? 'sort_order' : '0 AS sort_order';

  const [rows] = await connection.query(
    `SELECT config_value_id, ${labelSelect}, ${nameSelect}, ${valueSelect}, ${activeSelect}, ${sortSelect}
       FROM config_values
      WHERE config_category_id = ?
      ORDER BY ${valueColumns.has('sort_order') ? 'sort_order,' : ''} config_value_id`,
    [categoryId]
  );

  return rows.map((row) => ({
    ...row,
    config_value_id: Number(row.config_value_id),
    is_active: Number(row.is_active) === 1 ? 1 : 0,
    sort_order: Number(row.sort_order || 0)
  }));
}

async function loadLotTypeUsage(connection) {
  const lotColumns = await getColumnSet(connection, 'lots');
  if (!lotColumns.has('lot_type_config_value_id')) return new Map();

  const [rows] = await connection.query(
    `SELECT lot_type_config_value_id AS config_value_id, COUNT(*) AS lot_count
       FROM lots
      WHERE lot_type_config_value_id IS NOT NULL
      GROUP BY lot_type_config_value_id`
  );

  return new Map(rows.map((row) => [Number(row.config_value_id), Number(row.lot_count || 0)]));
}

async function insertLotType(connection, categoryId, valueColumns, label, sortOrder) {
  const fields = ['config_category_id'];
  const values = [categoryId];

  if (valueColumns.has('code')) {
    fields.push('code');
    values.push(`legacy_${crypto.randomUUID().replace(/-/g, '')}`);
  }
  if (valueColumns.has('label')) {
    fields.push('label');
    values.push(label);
  }
  if (valueColumns.has('name')) {
    fields.push('name');
    values.push(label);
  }
  if (valueColumns.has('value')) {
    fields.push('value');
    values.push(label);
  }
  if (valueColumns.has('description')) {
    fields.push('description');
    values.push('Lot Type available in Create/Edit Lot and managed through Configuration.');
  }
  if (valueColumns.has('sort_order')) {
    fields.push('sort_order');
    values.push(sortOrder);
  }
  if (valueColumns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }
  if (valueColumns.has('is_protected')) {
    fields.push('is_protected');
    values.push(0);
  }

  const [result] = await connection.query(
    `INSERT INTO config_values (${fields.map((field) => `\`${field}\``).join(', ')})
     VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function updateTargetLotType(connection, valueColumns, configValueId, label, sortOrder) {
  const assignments = [];
  const values = [];

  if (valueColumns.has('label')) {
    assignments.push('label = ?');
    values.push(label);
  }
  if (valueColumns.has('name')) {
    assignments.push('name = ?');
    values.push(label);
  }
  if (valueColumns.has('sort_order')) {
    assignments.push('sort_order = ?');
    values.push(sortOrder);
  }
  if (valueColumns.has('is_active')) {
    assignments.push('is_active = 1');
  }

  if (assignments.length === 0) return;
  values.push(configValueId);
  await connection.query(
    `UPDATE config_values SET ${assignments.join(', ')} WHERE config_value_id = ? LIMIT 1`,
    values
  );
}

async function deactivateLotTypes(connection, valueColumns, rows) {
  if (!valueColumns.has('is_active') || rows.length === 0) return 0;
  const ids = rows.map((row) => Number(row.config_value_id));
  await connection.query(
    `UPDATE config_values SET is_active = 0 WHERE config_value_id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  return ids.length;
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const categoryId = await getLotTypeCategoryId(connection);
    const valueColumns = await getColumnSet(connection, 'config_values');
    const rows = await loadLotTypeRows(connection, categoryId, valueColumns);
    const usage = await loadLotTypeUsage(connection);
    const plan = buildLotTypePlan(rows);

    console.log('Configured Lot Type target list:');
    TARGET_LOT_TYPES.forEach((target, index) => console.log(`  ${index + 1}. ${target.label}`));
    console.log(`Lot Types category ID: ${categoryId}`);
    console.log(`Lot Type values found: ${rows.length}`);

    if (plan.ambiguities.length > 0) {
      plan.ambiguities.forEach((ambiguity) => {
        console.log(`AMBIGUOUS ${ambiguity.target}: ${ambiguity.matches.map((row) => `#${row.config_value_id} ${row.label || row.value || ''}`).join(', ')}`);
      });
      throw new Error('Lot Type configuration is ambiguous. Resolve duplicate target values in Configuration before applying this migration.');
    }

    plan.targets.forEach((target) => {
      if (target.existing) {
        const currentLabel = target.existing.label || target.existing.name || target.existing.value || `Value #${target.existing.config_value_id}`;
        const lotCount = usage.get(Number(target.existing.config_value_id)) || 0;
        const renameText = currentLabel === target.label ? '' : `; rename to ${target.label}`;
        console.log(`  ${target.label}: reuse config value ${target.existing.config_value_id} (${currentLabel}); ${lotCount} Lot reference(s)${renameText}`);
      } else {
        console.log(`  ${target.label}: will be inserted`);
      }
    });

    console.log(`Non-target active Lot Types to deactivate: ${plan.deactivate.length}`);
    plan.deactivate.forEach((row) => {
      console.log(`  #${row.config_value_id} ${row.label || row.name || row.value || 'Unnamed'} (${usage.get(Number(row.config_value_id)) || 0} existing Lot reference(s))`);
    });

    if (!APPLY) {
      console.log('No database changes were made. Existing Lots keep references to deactivated Lot Types; only new selections use active configured values. Re-run with --apply after reviewing this audit.');
      return;
    }

    await connection.beginTransaction();
    try {
      for (const target of plan.targets) {
        if (target.existing) {
          await updateTargetLotType(connection, valueColumns, target.existing.config_value_id, target.label, target.sortOrder);
        } else {
          await insertLotType(connection, categoryId, valueColumns, target.label, target.sortOrder);
        }
      }
      const deactivatedCount = await deactivateLotTypes(connection, valueColumns, plan.deactivate);
      await connection.commit();
      console.log(`Configured Lot Type migration applied. ${deactivatedCount} legacy/non-target active value(s) deactivated.`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  TARGET_LOT_TYPES,
  buildLotTypePlan,
  normalizeLotTypeText,
  rowMatchesAliases
};
