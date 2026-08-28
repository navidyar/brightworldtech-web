'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');
const CANONICAL_RESULTS = Object.freeze([
  Object.freeze({ label: 'Pass', aliases: Object.freeze(['pass', 'passed']), sortOrder: 10 }),
  Object.freeze({ label: 'Fail', aliases: Object.freeze(['fail', 'failed']), sortOrder: 20 })
]);

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
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

function pickColumn(columns, candidates) {
  return candidates.find((column) => columns.has(column)) || null;
}

async function getThreatCategoryId(connection) {
  if (!await tableExists(connection, 'system_config_categories')) {
    throw new Error('Configuration ID foundation is not applied. Run migrate:config-ids first.');
  }
  const [rows] = await connection.query(
    `SELECT config_category_id
     FROM system_config_categories
     WHERE system_config_category_id = ?
     LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES]
  );
  const id = Number(rows[0]?.config_category_id || 0);
  if (!id) throw new Error('Threat Protection Scan Results does not have a numeric system category binding.');
  return id;
}

async function loadValues(connection, categoryId) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const valueColumn = columns.has('value') ? 'value' : null;
  const [rows] = await connection.query(
    `SELECT
       cv.config_value_id,
       ${labelColumn ? `cv.${q(labelColumn)}` : 'NULL'} AS label,
       ${valueColumn ? `cv.${q(valueColumn)}` : 'NULL'} AS value,
       ${columns.has('sort_order') ? 'cv.sort_order' : '0'} AS sort_order,
       ${columns.has('is_active') ? 'cv.is_active' : '1'} AS is_active,
       ${columns.has('is_protected') ? 'cv.is_protected' : '0'} AS is_protected,
       scv.system_config_value_id
     FROM config_values cv
     LEFT JOIN system_config_values scv ON scv.config_value_id = cv.config_value_id
     WHERE cv.config_category_id = ?
     ORDER BY COALESCE(cv.sort_order, 0), cv.config_value_id`,
    [categoryId]
  );
  return rows.map((row) => ({
    ...row,
    config_value_id: Number(row.config_value_id),
    system_config_value_id: row.system_config_value_id == null ? null : Number(row.system_config_value_id)
  }));
}

function rowTokens(row) {
  return [normalizeToken(row.label), normalizeToken(row.value)].filter(Boolean);
}

function matchesDefinition(row, definition) {
  return rowTokens(row).some((token) => definition.aliases.includes(token));
}

function isExactCanonical(row, definition) {
  return rowTokens(row).includes(normalizeToken(definition.label));
}

function buildPlan(rows) {
  const entries = CANONICAL_RESULTS.map((definition) => {
    const matchingRows = rows.filter((row) => matchesDefinition(row, definition));
    const exactRows = matchingRows.filter((row) => isExactCanonical(row, definition));
    if (exactRows.length > 1) {
      throw new Error(`${definition.label} has multiple canonical-looking configuration rows (${exactRows.map((row) => row.config_value_id).join(', ')}). Resolve that ambiguity before applying this migration.`);
    }
    const targetRow = exactRows[0] || matchingRows[0] || null;
    const duplicateRows = targetRow
      ? matchingRows.filter((row) => row.config_value_id !== targetRow.config_value_id)
      : [];
    return { definition, matchingRows, targetRow, duplicateRows };
  });

  const recognizedIds = new Set(entries.flatMap((entry) => entry.matchingRows.map((row) => row.config_value_id)));
  const preservedRows = rows.filter((row) => !recognizedIds.has(row.config_value_id));
  return { entries, preservedRows };
}

async function insertCanonicalValue(connection, categoryId, definition) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const fields = ['config_category_id'];
  const values = [categoryId];
  if (columns.has('code')) {
    fields.push('code');
    values.push(`legacy_${crypto.randomUUID().replace(/-/g, '')}`);
  }
  if (labelColumn) {
    fields.push(labelColumn);
    values.push(definition.label);
  }
  if (columns.has('value')) {
    fields.push('value');
    values.push(definition.label);
  }
  if (columns.has('description')) {
    fields.push('description');
    values.push(`Canonical Threat Protection Scan result: ${definition.label}.`);
  }
  if (columns.has('sort_order')) {
    fields.push('sort_order');
    values.push(definition.sortOrder);
  }
  if (columns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }
  if (columns.has('is_protected')) {
    fields.push('is_protected');
    values.push(1);
  }
  const [result] = await connection.query(
    `INSERT INTO config_values (${fields.map(q).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function normalizeTarget(connection, targetId, categoryId, definition) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const assignments = ['config_category_id = ?'];
  const params = [categoryId];
  if (labelColumn) {
    assignments.push(`${q(labelColumn)} = ?`);
    params.push(definition.label);
  }
  if (columns.has('value')) {
    assignments.push('value = ?');
    params.push(definition.label);
  }
  if (columns.has('description')) {
    assignments.push('description = ?');
    params.push(`Canonical Threat Protection Scan result: ${definition.label}.`);
  }
  if (columns.has('sort_order')) {
    assignments.push('sort_order = ?');
    params.push(definition.sortOrder);
  }
  if (columns.has('is_active')) assignments.push('is_active = 1');
  if (columns.has('is_protected')) assignments.push('is_protected = 1');
  params.push(targetId);
  await connection.query(
    `UPDATE config_values SET ${assignments.join(', ')} WHERE config_value_id = ?`,
    params
  );
}

async function countReferences(connection, tableName, columnName, ids) {
  if (!await tableExists(connection, tableName) || ids.length === 0) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM ${q(tableName)}
     WHERE ${q(columnName)} IN (${placeholders})`,
    ids
  );
  return Number(rows[0]?.row_count || 0);
}

async function remapReferences(connection, tableName, columnName, sourceIds, targetId) {
  if (!await tableExists(connection, tableName)) return 0;
  const columns = await getColumnSet(connection, tableName);
  const ids = sourceIds.filter((id) => Number(id) !== Number(targetId));
  if (!columns.has(columnName) || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${q(tableName)}
     SET ${q(columnName)} = ?
     WHERE ${q(columnName)} IN (${placeholders})`,
    [targetId, ...ids]
  );
  return Number(result.affectedRows || 0);
}

async function deactivateRows(connection, ids) {
  if (ids.length === 0) return 0;
  const columns = await getColumnSet(connection, 'config_values');
  if (!columns.has('is_active')) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE config_values SET is_active = 0 WHERE config_value_id IN (${placeholders})`,
    ids
  );
  return Number(result.affectedRows || 0);
}

async function clearRankingCache(connection) {
  if (!await tableExists(connection, 'operational_option_usage_rankings')) return 0;
  const [result] = await connection.query(
    `DELETE FROM operational_option_usage_rankings WHERE option_scope = 'virus_check_status'`
  );
  return Number(result.affectedRows || 0);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    for (const tableName of ['config_values', 'system_config_categories', 'system_config_values']) {
      if (!await tableExists(connection, tableName)) {
        throw new Error(`Required table ${tableName} is missing.`);
      }
    }

    const categoryId = await getThreatCategoryId(connection);
    const rows = await loadValues(connection, categoryId);
    const plan = buildPlan(rows);

    console.log('Canonical Threat Protection Scan policy: Pass, Fail; preserve all other distinct results.');
    console.log(`Threat Protection Scan Results category ID: ${categoryId}`);
    console.log(`Category values found: ${rows.length}`);
    for (const entry of plan.entries) {
      console.log(`  ${entry.definition.label}: ${entry.matchingRows.length} semantic match(es)${entry.targetRow ? `; target config value ${entry.targetRow.config_value_id}` : '; will be inserted'}`);
      if (entry.duplicateRows.length > 0) {
        console.log(`    duplicates to merge/deactivate: ${entry.duplicateRows.map((row) => `${row.config_value_id}:${row.label || row.value}`).join(', ')}`);
      }
    }
    console.log(`Other distinct results preserved: ${plan.preservedRows.map((row) => row.label || row.value || `Value #${row.config_value_id}`).join(', ') || '(none)'}`);

    const duplicateIds = plan.entries.flatMap((entry) => entry.duplicateRows.map((row) => row.config_value_id));
    console.log(`unit_specifications.virus_check_status_config_value_id duplicate references: ${await countReferences(connection, 'unit_specifications', 'virus_check_status_config_value_id', duplicateIds)}`);
    console.log(`lot_requirements.requirement_config_value_id duplicate references: ${await countReferences(connection, 'lot_requirements', 'requirement_config_value_id', duplicateIds)}`);

    const unexpectedBindings = plan.entries.flatMap((entry) => entry.duplicateRows)
      .filter((row) => row.system_config_value_id != null);
    if (unexpectedBindings.length > 0) {
      throw new Error(`Duplicate Threat Protection results are system-bound (${unexpectedBindings.map((row) => `${row.config_value_id}->${row.system_config_value_id}`).join(', ')}). Refusing automatic merge.`);
    }

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply after reviewing this audit.');
      return;
    }

    await connection.beginTransaction();
    let unitReferencesRemapped = 0;
    let requirementReferencesRemapped = 0;
    const deactivationIds = [];

    for (const entry of plan.entries) {
      const targetId = entry.targetRow?.config_value_id
        || await insertCanonicalValue(connection, categoryId, entry.definition);
      await normalizeTarget(connection, targetId, categoryId, entry.definition);
      const sourceIds = entry.matchingRows.map((row) => row.config_value_id);
      unitReferencesRemapped += await remapReferences(
        connection,
        'unit_specifications',
        'virus_check_status_config_value_id',
        sourceIds,
        targetId
      );
      requirementReferencesRemapped += await remapReferences(
        connection,
        'lot_requirements',
        'requirement_config_value_id',
        sourceIds,
        targetId
      );
      deactivationIds.push(...entry.duplicateRows.map((row) => row.config_value_id));
    }

    const deactivated = await deactivateRows(connection, [...new Set(deactivationIds)]);
    const rankingRowsCleared = await clearRankingCache(connection);
    await connection.commit();

    console.log('Canonical Threat Protection Scan migration applied.');
    console.log(`Unit specification references remapped: ${unitReferencesRemapped}`);
    console.log(`Lot requirement references remapped: ${requirementReferencesRemapped}`);
    console.log(`Duplicate Pass/Fail aliases deactivated: ${deactivated}`);
    console.log(`Threat Protection ranking-cache rows cleared for safe refresh: ${rankingRowsCleared}`);
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* no active transaction */ }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
