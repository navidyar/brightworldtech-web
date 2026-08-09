'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const {
  CANONICAL_COSMETIC_GRADES,
  getCanonicalCosmeticGradeFromOption,
  isNotYetGradedToken
} = require('../services/cosmeticGradeNormalization');

const APPLY = process.argv.includes('--apply');
const CANONICAL_CATEGORY_CODE = 'cosmetic_grades';
const LEGACY_CATEGORY_CODES = Object.freeze([
  'overall_unit_grades',
  'unit_grades',
  'unit_grade'
]);
const ALL_GRADE_CATEGORY_CODES = Object.freeze([
  CANONICAL_CATEGORY_CODE,
  ...LEGACY_CATEGORY_CODES
]);

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
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

function pickColumn(columns, candidates) {
  return candidates.find((column) => columns.has(column)) || null;
}

async function loadGradeCategories(connection) {
  const placeholders = ALL_GRADE_CATEGORY_CODES.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT *
     FROM config_categories
     WHERE code IN (${placeholders})
     ORDER BY FIELD(code, ${placeholders})`,
    [...ALL_GRADE_CATEGORY_CODES, ...ALL_GRADE_CATEGORY_CODES]
  );
  return rows;
}

async function loadGradeValues(connection, categoryIds) {
  if (categoryIds.length === 0) {
    return [];
  }

  const valueColumns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(valueColumns, ['label', 'name']);
  const valueColumn = valueColumns.has('value') ? 'value' : null;
  const activeColumn = valueColumns.has('is_active') ? 'is_active' : null;
  const placeholders = categoryIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT
       cv.config_value_id,
       cv.config_category_id,
       cv.code,
       ${labelColumn ? `cv.${quoteIdentifier(labelColumn)}` : 'cv.code'} AS label,
       ${valueColumn ? `cv.${quoteIdentifier(valueColumn)}` : 'NULL'} AS value,
       ${activeColumn ? `cv.${quoteIdentifier(activeColumn)}` : '1'} AS is_active,
       cc.code AS category_code
     FROM config_values cv
     JOIN config_categories cc
       ON cc.config_category_id = cv.config_category_id
     WHERE cv.config_category_id IN (${placeholders})
     ORDER BY cv.config_value_id`,
    categoryIds
  );
  return rows;
}

function gradeRowPriority(row, canonicalGrade) {
  let score = 0;

  if (String(row.code || '').toLowerCase() === canonicalGrade.toLowerCase()) {
    score += 1000;
  }
  if (row.category_code === CANONICAL_CATEGORY_CODE) {
    score += 100;
  }
  if (String(row.label || '').trim().toUpperCase() === canonicalGrade) {
    score += 20;
  }
  if (String(row.value || '').trim().toUpperCase() === canonicalGrade) {
    score += 10;
  }

  return score;
}

function chooseCanonicalTarget(rows, canonicalGrade) {
  return rows
    .filter((row) => getCanonicalCosmeticGradeFromOption(row) === canonicalGrade)
    .sort((left, right) => (
      gradeRowPriority(right, canonicalGrade) - gradeRowPriority(left, canonicalGrade)
      || Number(left.config_value_id) - Number(right.config_value_id)
    ))[0] || null;
}

async function ensureCanonicalCategory(connection) {
  const categoryColumns = await getColumnSet(connection, 'config_categories');
  let [rows] = await connection.query(
    `SELECT *
     FROM config_categories
     WHERE code = ?
     LIMIT 1
     FOR UPDATE`,
    [CANONICAL_CATEGORY_CODE]
  );

  if (rows[0]) {
    const assignments = [];
    const params = [];

    for (const labelColumn of ['label', 'name']) {
      if (categoryColumns.has(labelColumn)) {
        assignments.push(`${quoteIdentifier(labelColumn)} = ?`);
        params.push('Cosmetic Grades');
      }
    }
    if (categoryColumns.has('description')) {
      assignments.push('description = ?');
      params.push('Canonical cosmetic letter grades used by Unit grading.');
    }
    if (categoryColumns.has('is_active')) {
      assignments.push('is_active = 1');
    }

    if (assignments.length > 0) {
      params.push(rows[0].config_category_id);
      await connection.query(
        `UPDATE config_categories
         SET ${assignments.join(', ')}
         WHERE config_category_id = ?`,
        params
      );
    }

    return Number(rows[0].config_category_id);
  }

  const fields = ['code'];
  const values = [CANONICAL_CATEGORY_CODE];

  for (const labelColumn of ['label', 'name']) {
    if (categoryColumns.has(labelColumn)) {
      fields.push(labelColumn);
      values.push('Cosmetic Grades');
    }
  }
  if (categoryColumns.has('description')) {
    fields.push('description');
    values.push('Canonical cosmetic letter grades used by Unit grading.');
  }
  if (categoryColumns.has('sort_order')) {
    fields.push('sort_order');
    values.push(310);
  }
  if (categoryColumns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }

  const [result] = await connection.query(
    `INSERT INTO config_categories (${fields.map(quoteIdentifier).join(', ')})
     VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function assertCanonicalCodeAvailable(connection, targetId, canonicalCode) {
  const [rows] = await connection.query(
    `SELECT config_value_id, config_category_id, code
     FROM config_values
     WHERE code = ?
       AND config_value_id <> ?
     LIMIT 1`,
    [canonicalCode, targetId]
  );

  if (rows[0]) {
    throw new Error(
      `Cannot canonicalize Cosmetic Grade ${canonicalCode.toUpperCase()}: config_values.code '${canonicalCode}' is already used by config value ${rows[0].config_value_id}.`
    );
  }
}

async function canonicalizeTargetRow(connection, targetRow, canonicalCategoryId, gradeDefinition) {
  const valueColumns = await getColumnSet(connection, 'config_values');
  const targetId = Number(targetRow.config_value_id);
  await assertCanonicalCodeAvailable(connection, targetId, gradeDefinition.code);

  const assignments = ['config_category_id = ?', 'code = ?'];
  const params = [canonicalCategoryId, gradeDefinition.code];

  for (const labelColumn of ['label', 'name']) {
    if (valueColumns.has(labelColumn)) {
      assignments.push(`${quoteIdentifier(labelColumn)} = ?`);
      params.push(gradeDefinition.label);
    }
  }
  if (valueColumns.has('value')) {
    assignments.push('value = ?');
    params.push(gradeDefinition.value);
  }
  if (valueColumns.has('description')) {
    assignments.push('description = ?');
    params.push(`Canonical Cosmetic Grade ${gradeDefinition.value}.`);
  }
  if (valueColumns.has('sort_order')) {
    assignments.push('sort_order = ?');
    params.push(gradeDefinition.sortOrder);
  }
  if (valueColumns.has('is_active')) {
    assignments.push('is_active = 1');
  }

  params.push(targetId);
  await connection.query(
    `UPDATE config_values
     SET ${assignments.join(', ')}
     WHERE config_value_id = ?`,
    params
  );
  return targetId;
}

async function insertCanonicalGrade(connection, canonicalCategoryId, gradeDefinition) {
  const valueColumns = await getColumnSet(connection, 'config_values');
  await assertCanonicalCodeAvailable(connection, 0, gradeDefinition.code);

  const fields = ['config_category_id', 'code'];
  const values = [canonicalCategoryId, gradeDefinition.code];

  for (const labelColumn of ['label', 'name']) {
    if (valueColumns.has(labelColumn)) {
      fields.push(labelColumn);
      values.push(gradeDefinition.label);
    }
  }
  if (valueColumns.has('value')) {
    fields.push('value');
    values.push(gradeDefinition.value);
  }
  if (valueColumns.has('description')) {
    fields.push('description');
    values.push(`Canonical Cosmetic Grade ${gradeDefinition.value}.`);
  }
  if (valueColumns.has('sort_order')) {
    fields.push('sort_order');
    values.push(gradeDefinition.sortOrder);
  }
  if (valueColumns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }

  const [result] = await connection.query(
    `INSERT INTO config_values (${fields.map(quoteIdentifier).join(', ')})
     VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function remapReferenceColumn(connection, tableName, columnName, sourceIds, targetId) {
  if (!await tableExists(connection, tableName)) {
    return 0;
  }
  const columns = await getColumnSet(connection, tableName);

  if (!columns.has(columnName) || sourceIds.length === 0) {
    return 0;
  }

  const ids = sourceIds.filter((id) => Number(id) !== Number(targetId));

  if (ids.length === 0) {
    return 0;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${quoteIdentifier(tableName)}
     SET ${quoteIdentifier(columnName)} = ?
     WHERE ${quoteIdentifier(columnName)} IN (${placeholders})`,
    [targetId, ...ids]
  );
  return Number(result.affectedRows || 0);
}

async function countReferenceColumn(connection, tableName, columnName, sourceIds) {
  if (!await tableExists(connection, tableName) || sourceIds.length === 0) {
    return 0;
  }
  const columns = await getColumnSet(connection, tableName);

  if (!columns.has(columnName)) {
    return 0;
  }

  const placeholders = sourceIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM ${quoteIdentifier(tableName)}
     WHERE ${quoteIdentifier(columnName)} IN (${placeholders})`,
    sourceIds
  );
  return Number(rows[0]?.row_count || 0);
}

async function deactivateNonCanonicalGradeValues(connection, targetIds, allGradeCategoryIds) {
  const valueColumns = await getColumnSet(connection, 'config_values');

  if (!valueColumns.has('is_active') || allGradeCategoryIds.length === 0) {
    return 0;
  }

  const categoryPlaceholders = allGradeCategoryIds.map(() => '?').join(', ');
  const targetPlaceholders = targetIds.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE config_values
     SET is_active = 0
     WHERE config_category_id IN (${categoryPlaceholders})
       AND config_value_id NOT IN (${targetPlaceholders})`,
    [...allGradeCategoryIds, ...targetIds]
  );
  return Number(result.affectedRows || 0);
}

async function deactivateLegacyCategories(connection, legacyCategoryIds) {
  if (legacyCategoryIds.length === 0) {
    return 0;
  }
  const columns = await getColumnSet(connection, 'config_categories');

  if (!columns.has('is_active')) {
    return 0;
  }

  const placeholders = legacyCategoryIds.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE config_categories
     SET is_active = 0
     WHERE config_category_id IN (${placeholders})`,
    legacyCategoryIds
  );
  return Number(result.affectedRows || 0);
}

async function clearCurrentNotYetGradedAssessments(connection, notYetGradeIds) {
  if (!await tableExists(connection, 'unit_grade_assessments') || notYetGradeIds.length === 0) {
    return 0;
  }
  const columns = await getColumnSet(connection, 'unit_grade_assessments');

  if (!columns.has('overall_grade_config_value_id') || !columns.has('is_current')) {
    return 0;
  }

  const placeholders = notYetGradeIds.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE unit_grade_assessments
     SET is_current = 0
     WHERE is_current = 1
       AND overall_grade_config_value_id IN (${placeholders})`,
    notYetGradeIds
  );
  return Number(result.affectedRows || 0);
}

async function clearNotYetGradedLotDefaults(connection, notYetGradeIds) {
  if (!await tableExists(connection, 'lots') || notYetGradeIds.length === 0) {
    return 0;
  }
  const columns = await getColumnSet(connection, 'lots');

  if (!columns.has('default_grade_config_value_id')) {
    return 0;
  }

  const placeholders = notYetGradeIds.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE lots
     SET default_grade_config_value_id = NULL
     WHERE default_grade_config_value_id IN (${placeholders})`,
    notYetGradeIds
  );
  return Number(result.affectedRows || 0);
}

async function main() {
  const connection = await pool.getConnection();

  try {
    for (const tableName of ['config_categories', 'config_values']) {
      if (!await tableExists(connection, tableName)) {
        throw new Error(`Required table ${tableName} is missing.`);
      }
    }

    const categories = await loadGradeCategories(connection);
    const canonicalCategory = categories.find((row) => row.code === CANONICAL_CATEGORY_CODE) || null;
    const categoryIds = categories.map((row) => Number(row.config_category_id)).filter(Boolean);
    const gradeRows = await loadGradeValues(connection, categoryIds);
    const rowPlan = CANONICAL_COSMETIC_GRADES.map((grade) => ({
      grade,
      matchingRows: gradeRows.filter((row) => getCanonicalCosmeticGradeFromOption(row) === grade.value),
      chosenRow: chooseCanonicalTarget(gradeRows, grade.value)
    }));
    const notYetGradeRows = gradeRows.filter((row) => (
      [row.code, row.label, row.value].some(isNotYetGradedToken)
    ));
    const nonCanonicalRows = gradeRows.filter((row) => (
      !getCanonicalCosmeticGradeFromOption(row)
      && ![row.code, row.label, row.value].some(isNotYetGradedToken)
    ));

    console.log('Canonical Cosmetic Grade policy: A, AB, B, C, D');
    console.log(`Canonical category present: ${canonicalCategory ? 'yes' : 'no'}`);
    console.log(`Grade-category config values found: ${gradeRows.length}`);
    for (const plan of rowPlan) {
      console.log(`  ${plan.grade.value}: ${plan.matchingRows.length} matching database value(s)${plan.chosenRow ? `; preferred config value ${plan.chosenRow.config_value_id}` : '; will be inserted'}`);
    }
    console.log(`Not-yet-graded config values found: ${notYetGradeRows.length}`);
    console.log(`Other noncanonical grade-category values found: ${nonCanonicalRows.length}`);
    nonCanonicalRows.forEach((row) => console.log(`  - ${row.category_code}.${row.code} (${row.label || row.value || 'no label'})`));

    const plannedMappings = new Map();
    for (const plan of rowPlan) {
      if (!plan.chosenRow) continue;
      for (const row of plan.matchingRows) {
        plannedMappings.set(Number(row.config_value_id), Number(plan.chosenRow.config_value_id));
      }
    }

    for (const [tableName, columnName] of [
      ['unit_grade_assessments', 'overall_grade_config_value_id'],
      ['lots', 'default_grade_config_value_id'],
      ['lot_requirements', 'requirement_config_value_id']
    ]) {
      let total = 0;
      for (const plan of rowPlan) {
        const sourceIds = plan.matchingRows.map((row) => Number(row.config_value_id));
        total += await countReferenceColumn(connection, tableName, columnName, sourceIds);
      }
      console.log(`${tableName}.${columnName} grade references: ${total}`);
    }

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply after reviewing this audit.');
      return;
    }

    await connection.beginTransaction();
    const canonicalCategoryId = await ensureCanonicalCategory(connection);
    const refreshedCategories = await loadGradeCategories(connection);
    const refreshedCategoryIds = refreshedCategories.map((row) => Number(row.config_category_id)).filter(Boolean);
    let refreshedRows = await loadGradeValues(connection, refreshedCategoryIds);
    const canonicalIdsByGrade = new Map();

    for (const gradeDefinition of CANONICAL_COSMETIC_GRADES) {
      const chosenRow = chooseCanonicalTarget(refreshedRows, gradeDefinition.value);
      const targetId = chosenRow
        ? await canonicalizeTargetRow(connection, chosenRow, canonicalCategoryId, gradeDefinition)
        : await insertCanonicalGrade(connection, canonicalCategoryId, gradeDefinition);
      canonicalIdsByGrade.set(gradeDefinition.value, targetId);
      refreshedRows = await loadGradeValues(connection, refreshedCategoryIds);
    }

    let assessmentRemaps = 0;
    let lotDefaultRemaps = 0;
    let requirementRemaps = 0;

    for (const gradeDefinition of CANONICAL_COSMETIC_GRADES) {
      const targetId = canonicalIdsByGrade.get(gradeDefinition.value);
      const sourceIds = refreshedRows
        .filter((row) => getCanonicalCosmeticGradeFromOption(row) === gradeDefinition.value)
        .map((row) => Number(row.config_value_id));
      assessmentRemaps += await remapReferenceColumn(
        connection,
        'unit_grade_assessments',
        'overall_grade_config_value_id',
        sourceIds,
        targetId
      );
      lotDefaultRemaps += await remapReferenceColumn(
        connection,
        'lots',
        'default_grade_config_value_id',
        sourceIds,
        targetId
      );
      requirementRemaps += await remapReferenceColumn(
        connection,
        'lot_requirements',
        'requirement_config_value_id',
        sourceIds,
        targetId
      );
    }

    refreshedRows = await loadGradeValues(connection, refreshedCategoryIds);
    const refreshedNotYetIds = refreshedRows
      .filter((row) => [row.code, row.label, row.value].some(isNotYetGradedToken))
      .map((row) => Number(row.config_value_id));
    const clearedCurrentNotYet = await clearCurrentNotYetGradedAssessments(connection, refreshedNotYetIds);
    const clearedLotDefaults = await clearNotYetGradedLotDefaults(connection, refreshedNotYetIds);
    const targetIds = Array.from(canonicalIdsByGrade.values());
    const deactivatedValues = await deactivateNonCanonicalGradeValues(connection, targetIds, refreshedCategoryIds);
    const legacyCategoryIds = refreshedCategories
      .filter((row) => LEGACY_CATEGORY_CODES.includes(row.code))
      .map((row) => Number(row.config_category_id));
    const deactivatedCategories = await deactivateLegacyCategories(connection, legacyCategoryIds);

    await connection.commit();

    console.log('Canonical Cosmetic Grade migration applied.');
    console.log(`Canonical config values: ${CANONICAL_COSMETIC_GRADES.map((grade) => `${grade.value}=${canonicalIdsByGrade.get(grade.value)}`).join(', ')}`);
    console.log(`Assessment references remapped: ${assessmentRemaps}`);
    console.log(`Lot default references remapped: ${lotDefaultRemaps}`);
    console.log(`Lot requirement references remapped: ${requirementRemaps}`);
    console.log(`Current Not Yet Graded assessments cleared: ${clearedCurrentNotYet}`);
    console.log(`Not Yet Graded lot defaults cleared: ${clearedLotDefaults}`);
    console.log(`Legacy/noncanonical grade values deactivated: ${deactivatedValues}`);
    console.log(`Legacy grade categories deactivated: ${deactivatedCategories}`);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback errors when no transaction is active.
    }
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
