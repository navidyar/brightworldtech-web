'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');
const CATEGORY_CODE = 'sff';
const CATEGORY_LABEL = 'SFF';
const CATEGORY_VALUE = 'sff';
const CATEGORY_DESCRIPTION = 'Small Form Factor';

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
}

async function getUnitCategoryConfigCategoryId(connection) {
  const [rows] = await connection.query(
    `SELECT config_category_id
       FROM system_config_categories
      WHERE system_config_category_id = ?
      LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES]
  );
  const id = Number(rows[0]?.config_category_id || 0);
  if (!id) throw new Error('Unit Categories are not bound in system_config_categories. Run the configuration ID migration first.');
  return id;
}

async function audit(connection) {
  const categoryId = await getUnitCategoryConfigCategoryId(connection);
  const columns = await getColumnSet(connection, 'config_values');
  if (!columns.has('config_value_id') || !columns.has('config_category_id')) {
    throw new Error('config_values does not have the expected configuration columns.');
  }

  const select = [
    'config_value_id',
    columns.has('code') ? 'code' : "'' AS code",
    columns.has('label') ? 'label' : "'' AS label",
    columns.has('value') ? 'value' : "'' AS value",
    columns.has('description') ? 'description' : "'' AS description",
    columns.has('sort_order') ? 'sort_order' : '0 AS sort_order',
    columns.has('is_active') ? 'is_active' : '1 AS is_active'
  ].join(', ');
  const [rows] = await connection.query(
    `SELECT ${select}
       FROM config_values
      WHERE config_category_id = ?
      ORDER BY config_value_id`,
    [categoryId]
  );

  const matches = rows.filter((row) => {
    const tokens = [row.code, row.label, row.value].map(normalize);
    return tokens.includes('sff') || tokens.includes('smallformfactor');
  });

  if (matches.length > 1) {
    throw new Error(`Multiple SFF/Small Form Factor Unit Category values already exist (${matches.map((row) => row.config_value_id).join(', ')}). Reconcile them before applying this migration.`);
  }

  const existing = matches[0] || null;
  const maxSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), 0);
  const desiredSortOrder = existing ? Number(existing.sort_order || 0) : maxSortOrder + 10;
  const needsUpdate = Boolean(existing) && (
    (columns.has('code') && String(existing.code || '') !== CATEGORY_CODE)
    || (columns.has('label') && String(existing.label || '') !== CATEGORY_LABEL)
    || (columns.has('value') && String(existing.value || '') !== CATEGORY_VALUE)
    || (columns.has('description') && String(existing.description || '') !== CATEGORY_DESCRIPTION)
    || (columns.has('is_active') && Number(existing.is_active || 0) !== 1)
  );

  return {
    categoryId,
    columns,
    existing,
    desiredSortOrder,
    action: !existing ? 'create' : needsUpdate ? 'normalize' : 'none'
  };
}

async function applyPlan(connection, plan) {
  if (plan.action === 'none') return;

  if (plan.action === 'create') {
    const fields = ['config_category_id'];
    const values = [plan.categoryId];
    const add = (column, value) => {
      if (plan.columns.has(column)) {
        fields.push(column);
        values.push(value);
      }
    };
    add('code', CATEGORY_CODE);
    add('label', CATEGORY_LABEL);
    add('value', CATEGORY_VALUE);
    add('description', CATEGORY_DESCRIPTION);
    add('sort_order', plan.desiredSortOrder);
    add('is_active', 1);

    const placeholders = fields.map(() => '?').join(', ');
    await connection.query(
      `INSERT INTO config_values (${fields.map((field) => `\`${field}\``).join(', ')}) VALUES (${placeholders})`,
      values
    );
    return;
  }

  const assignments = [];
  const values = [];
  const set = (column, value) => {
    if (plan.columns.has(column)) {
      assignments.push(`\`${column}\` = ?`);
      values.push(value);
    }
  };
  set('code', CATEGORY_CODE);
  set('label', CATEGORY_LABEL);
  set('value', CATEGORY_VALUE);
  set('description', CATEGORY_DESCRIPTION);
  set('is_active', 1);
  values.push(Number(plan.existing.config_value_id));
  await connection.query(
    `UPDATE config_values SET ${assignments.join(', ')} WHERE config_value_id = ? LIMIT 1`,
    values
  );
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const plan = await audit(connection);
    console.log(`SFF Unit Category migration (${APPLY ? 'apply' : 'audit'})`);
    console.log(`Unit Categories config_category_id: ${plan.categoryId}`);
    console.log(`Current state: ${plan.existing ? `config_value_id ${plan.existing.config_value_id}` : 'missing'}`);
    console.log(`Planned action: ${plan.action}`);

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply to create/normalize SFF.');
      return;
    }

    await connection.beginTransaction();
    await applyPlan(connection, plan);
    await connection.commit();
    const verified = await audit(connection);
    if (!verified.existing || verified.action !== 'none') {
      throw new Error('SFF Unit Category verification failed after apply.');
    }
    console.log(`SFF Unit Category is active as config_value_id ${verified.existing.config_value_id} with description "${CATEGORY_DESCRIPTION}".`);
  } catch (error) {
    if (APPLY) {
      try { await connection.rollback(); } catch (_) { /* preserve original error */ }
    }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
