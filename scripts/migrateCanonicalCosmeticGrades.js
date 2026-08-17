'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const { pool } = require('../models/db');
const {
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS
} = require('../config/configIdentityRegistry');
const {
  CANONICAL_COSMETIC_GRADES,
  getCanonicalCosmeticGradeFromOption,
  isNotYetGradedToken
} = require('../services/cosmeticGradeNormalization');

const APPLY = process.argv.includes('--apply');
const GRADE_SYSTEM_IDS = Object.freeze({
  A: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_A,
  AB: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_AB,
  B: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_B,
  C: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_C,
  D: SYSTEM_CONFIG_VALUE_IDS.COSMETIC_GRADE_D
});

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
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

async function getCosmeticCategoryId(connection) {
  if (!await tableExists(connection, 'system_config_categories')) {
    throw new Error('Configuration ID foundation is not applied. Run migrate:config-ids first.');
  }
  const [rows] = await connection.query(
    `SELECT config_category_id
     FROM system_config_categories
     WHERE system_config_category_id = ?
     LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES]
  );
  const id = Number(rows[0]?.config_category_id || 0);
  if (!id) throw new Error('Cosmetic Grades does not have a numeric system category binding.');
  return id;
}

async function loadGradeValues(connection, categoryId) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const valueColumn = columns.has('value') ? 'value' : null;
  const activeColumn = columns.has('is_active') ? 'is_active' : null;
  const protectedColumn = columns.has('is_protected') ? 'is_protected' : null;
  const [rows] = await connection.query(
    `SELECT
       cv.config_value_id,
       cv.config_category_id,
       ${labelColumn ? `cv.${quoteIdentifier(labelColumn)}` : 'NULL'} AS label,
       ${valueColumn ? `cv.${quoteIdentifier(valueColumn)}` : 'NULL'} AS value,
       ${activeColumn ? `cv.${quoteIdentifier(activeColumn)}` : '1'} AS is_active,
       ${protectedColumn ? `cv.${quoteIdentifier(protectedColumn)}` : '0'} AS is_protected,
       scv.system_config_value_id
     FROM config_values cv
     LEFT JOIN system_config_values scv ON scv.config_value_id = cv.config_value_id
     WHERE cv.config_category_id = ?
     ORDER BY cv.config_value_id`,
    [categoryId]
  );
  return rows.map((row) => ({
    ...row,
    config_value_id: Number(row.config_value_id),
    config_category_id: Number(row.config_category_id),
    system_config_value_id: row.system_config_value_id == null ? null : Number(row.system_config_value_id)
  }));
}

function matchesGrade(row, grade) {
  return getCanonicalCosmeticGradeFromOption(row) === grade;
}

function buildPlan(rows) {
  const entries = CANONICAL_COSMETIC_GRADES.map((gradeDefinition) => {
    const systemId = GRADE_SYSTEM_IDS[gradeDefinition.value];
    const boundRows = rows.filter((row) => Number(row.system_config_value_id) === Number(systemId));
    if (boundRows.length > 1) {
      throw new Error(`Cosmetic Grade ${gradeDefinition.value} has multiple system bindings.`);
    }
    const matchingRows = rows.filter((row) => matchesGrade(row, gradeDefinition.value));
    const boundRow = boundRows[0] || null;
    if (boundRow && !matchesGrade(boundRow, gradeDefinition.value)) {
      throw new Error(`System Cosmetic Grade ${gradeDefinition.value} is bound to config value ${boundRow.config_value_id}, but that row no longer represents ${gradeDefinition.value}.`);
    }

    const unboundMatches = matchingRows.filter((row) => !row.system_config_value_id);
    if (!boundRow && unboundMatches.length > 1) {
      throw new Error(`Cosmetic Grade ${gradeDefinition.value} has multiple unbound matching values (${unboundMatches.map((row) => row.config_value_id).join(', ')}). Run the configuration ID audit before canonicalizing.`);
    }

    const targetRow = boundRow || unboundMatches[0] || null;
    return {
      gradeDefinition,
      systemId,
      targetRow,
      matchingRows
    };
  });

  const notYetRows = rows.filter((row) => [row.label, row.value].some(isNotYetGradedToken));
  const targetIds = new Set(entries.map((entry) => entry.targetRow?.config_value_id).filter(Boolean));
  const otherRows = rows.filter((row) => (
    !targetIds.has(row.config_value_id)
    && !entries.some((entry) => entry.matchingRows.some((candidate) => candidate.config_value_id === row.config_value_id))
    && !notYetRows.some((candidate) => candidate.config_value_id === row.config_value_id)
  ));
  return { entries, notYetRows, otherRows };
}

async function countReferenceColumn(connection, tableName, columnName, ids) {
  if (!await tableExists(connection, tableName) || ids.length === 0) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(tableName)}
     WHERE ${quoteIdentifier(columnName)} IN (${placeholders})`,
    ids
  );
  return Number(rows[0]?.row_count || 0);
}

async function remapReferenceColumn(connection, tableName, columnName, sourceIds, targetId) {
  if (!await tableExists(connection, tableName)) return 0;
  const columns = await getColumnSet(connection, tableName);
  const ids = sourceIds.filter((id) => Number(id) !== Number(targetId));
  if (!columns.has(columnName) || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${quoteIdentifier(tableName)}
     SET ${quoteIdentifier(columnName)} = ?
     WHERE ${quoteIdentifier(columnName)} IN (${placeholders})`,
    [targetId, ...ids]
  );
  return Number(result.affectedRows || 0);
}

async function insertGradeValue(connection, categoryId, gradeDefinition) {
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
    values.push(gradeDefinition.label);
  }
  if (columns.has('value')) {
    fields.push('value');
    values.push(gradeDefinition.value);
  }
  if (columns.has('description')) {
    fields.push('description');
    values.push(`Canonical Cosmetic Grade ${gradeDefinition.value}.`);
  }
  if (columns.has('sort_order')) {
    fields.push('sort_order');
    values.push(gradeDefinition.sortOrder);
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
    `INSERT INTO config_values (${fields.map(quoteIdentifier).join(', ')})
     VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function normalizeTargetValue(connection, targetId, categoryId, gradeDefinition) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const assignments = ['config_category_id = ?'];
  const params = [categoryId];
  if (labelColumn) {
    assignments.push(`${quoteIdentifier(labelColumn)} = ?`);
    params.push(gradeDefinition.label);
  }
  if (columns.has('value')) {
    assignments.push('value = ?');
    params.push(gradeDefinition.value);
  }
  if (columns.has('description')) {
    assignments.push('description = ?');
    params.push(`Canonical Cosmetic Grade ${gradeDefinition.value}.`);
  }
  if (columns.has('sort_order')) {
    assignments.push('sort_order = ?');
    params.push(gradeDefinition.sortOrder);
  }
  if (columns.has('is_active')) assignments.push('is_active = 1');
  if (columns.has('is_protected')) assignments.push('is_protected = 1');
  params.push(targetId);
  await connection.query(
    `UPDATE config_values SET ${assignments.join(', ')} WHERE config_value_id = ?`,
    params
  );
}

async function bindGradeValue(connection, systemId, configValueId) {
  await connection.query(
    `INSERT INTO system_config_values (system_config_value_id, config_value_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
    [systemId, configValueId]
  );
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

async function clearCurrentNotYetGradedAssessments(connection, ids) {
  if (!await tableExists(connection, 'unit_grade_assessments') || ids.length === 0) return 0;
  const columns = await getColumnSet(connection, 'unit_grade_assessments');
  if (!columns.has('overall_grade_config_value_id') || !columns.has('is_current')) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE unit_grade_assessments SET is_current = 0
     WHERE is_current = 1 AND overall_grade_config_value_id IN (${placeholders})`,
    ids
  );
  return Number(result.affectedRows || 0);
}

async function clearNotYetGradedLotDefaults(connection, ids) {
  if (!await tableExists(connection, 'lots') || ids.length === 0) return 0;
  const columns = await getColumnSet(connection, 'lots');
  if (!columns.has('default_grade_config_value_id')) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE lots SET default_grade_config_value_id = NULL
     WHERE default_grade_config_value_id IN (${placeholders})`,
    ids
  );
  return Number(result.affectedRows || 0);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    for (const tableName of ['config_categories', 'config_values', 'system_config_categories', 'system_config_values']) {
      if (!await tableExists(connection, tableName)) {
        throw new Error(`Required table ${tableName} is missing. Apply the configuration ID foundation first.`);
      }
    }

    const categoryId = await getCosmeticCategoryId(connection);
    const rows = await loadGradeValues(connection, categoryId);
    const plan = buildPlan(rows);

    console.log('Canonical Cosmetic Grade policy: A, AB, B, C, D');
    console.log(`Cosmetic Grades category ID: ${categoryId}`);
    console.log(`Grade-category config values found: ${rows.length}`);
    for (const entry of plan.entries) {
      console.log(`  ${entry.gradeDefinition.value}: ${entry.matchingRows.length} matching value(s)${entry.targetRow ? `; target config value ${entry.targetRow.config_value_id}` : '; will be inserted'}`);
    }
    console.log(`Not-yet-graded values found: ${plan.notYetRows.length}`);
    console.log(`Other noncanonical values found: ${plan.otherRows.length}`);

    for (const [tableName, columnName] of [
      ['unit_grade_assessments', 'overall_grade_config_value_id'],
      ['lots', 'default_grade_config_value_id'],
      ['lot_requirements', 'requirement_config_value_id']
    ]) {
      const ids = plan.entries.flatMap((entry) => entry.matchingRows.map((row) => row.config_value_id));
      console.log(`${tableName}.${columnName} grade references: ${await countReferenceColumn(connection, tableName, columnName, ids)}`);
    }

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply after reviewing this audit.');
      return;
    }

    await connection.beginTransaction();
    const targetIds = new Set();
    let assessmentRemaps = 0;
    let lotDefaultRemaps = 0;
    let requirementRemaps = 0;

    for (const entry of plan.entries) {
      const targetId = entry.targetRow?.config_value_id
        || await insertGradeValue(connection, categoryId, entry.gradeDefinition);
      await normalizeTargetValue(connection, targetId, categoryId, entry.gradeDefinition);
      await bindGradeValue(connection, entry.systemId, targetId);
      targetIds.add(targetId);
      const sourceIds = entry.matchingRows.map((row) => row.config_value_id);
      assessmentRemaps += await remapReferenceColumn(connection, 'unit_grade_assessments', 'overall_grade_config_value_id', sourceIds, targetId);
      lotDefaultRemaps += await remapReferenceColumn(connection, 'lots', 'default_grade_config_value_id', sourceIds, targetId);
      requirementRemaps += await remapReferenceColumn(connection, 'lot_requirements', 'requirement_config_value_id', sourceIds, targetId);
    }

    const duplicateIds = rows
      .filter((row) => plan.entries.some((entry) => entry.matchingRows.some((candidate) => candidate.config_value_id === row.config_value_id)))
      .map((row) => row.config_value_id)
      .filter((id) => !targetIds.has(id));
    const notYetIds = plan.notYetRows.map((row) => row.config_value_id);
    const clearedCurrentNotYet = await clearCurrentNotYetGradedAssessments(connection, notYetIds);
    const clearedLotDefaults = await clearNotYetGradedLotDefaults(connection, notYetIds);
    const deactivatedValues = await deactivateRows(connection, [...new Set([...duplicateIds, ...notYetIds, ...plan.otherRows.map((row) => row.config_value_id)])]);

    await connection.commit();
    console.log('Canonical Cosmetic Grade migration applied.');
    console.log(`Assessment references remapped: ${assessmentRemaps}`);
    console.log(`Lot default references remapped: ${lotDefaultRemaps}`);
    console.log(`Lot requirement references remapped: ${requirementRemaps}`);
    console.log(`Current Not Yet Graded assessments cleared: ${clearedCurrentNotYet}`);
    console.log(`Not Yet Graded lot defaults cleared: ${clearedLotDefaults}`);
    console.log(`Legacy/noncanonical grade values deactivated: ${deactivatedValues}`);
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
