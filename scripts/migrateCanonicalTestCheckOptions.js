'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

const CATEGORY_PLANS = Object.freeze([
  Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES,
    label: 'Touchscreen Statuses',
    canonical: Object.freeze([
      Object.freeze({ label: 'Pass', aliases: Object.freeze(['pass', 'passed', 'working']) }),
      Object.freeze({ label: 'Fail', aliases: Object.freeze(['fail', 'failed', 'not working', 'not_working']) }),
      Object.freeze({ label: 'Physically Not Present', aliases: Object.freeze(['physically not present', 'not present', 'not_present']) })
    ]),
    references: Object.freeze([
      Object.freeze(['unit_specifications', 'touchscreen_status_config_value_id'])
    ])
  }),
  Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES,
    label: 'Diagnostics Statuses',
    canonical: Object.freeze([
      Object.freeze({ label: 'Pass', aliases: Object.freeze(['pass', 'passed']) }),
      Object.freeze({ label: 'Fail', aliases: Object.freeze(['fail', 'failed']) })
    ]),
    references: Object.freeze([
      Object.freeze(['unit_specifications', 'complete_diagnostics_status_config_value_id'])
    ])
  }),
  Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES,
    label: 'Threat Protection Scan Results',
    canonical: Object.freeze([
      Object.freeze({ label: 'Pass', aliases: Object.freeze(['pass', 'passed']) }),
      Object.freeze({ label: 'Fail', aliases: Object.freeze(['fail', 'failed']) })
    ]),
    references: Object.freeze([
      Object.freeze(['unit_specifications', 'virus_check_status_config_value_id'])
    ])
  }),
  Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.DRIVER_CHECK_STATUSES,
    label: 'Driver Check Statuses',
    canonical: Object.freeze([
      Object.freeze({ label: 'Pass', aliases: Object.freeze(['pass', 'passed']) }),
      Object.freeze({ label: 'Fail', aliases: Object.freeze(['fail', 'failed']) })
    ]),
    references: Object.freeze([
      Object.freeze(['unit_specifications', 'driver_check_status_config_value_id'])
    ])
  }),
  Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS,
    label: 'Test Results',
    canonical: Object.freeze([
      Object.freeze({ label: 'Pass', aliases: Object.freeze(['pass', 'passed']) }),
      Object.freeze({ label: 'Fail', aliases: Object.freeze(['fail', 'failed']) }),
      Object.freeze({ label: 'Physically Not Present', aliases: Object.freeze(['physically not present']) })
    ]),
    references: Object.freeze([
      Object.freeze(['unit_specifications', 'keyboard_test_result_config_value_id']),
      Object.freeze(['unit_specifications', 'microphone_check_result_config_value_id']),
      Object.freeze(['unit_specifications', 'audio_output_check_result_config_value_id'])
    ])
  }),
  Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.COMPONENT_TEST_RESULTS,
    label: 'Component Test Results',
    canonical: Object.freeze([
      Object.freeze({ label: 'Pass', aliases: Object.freeze(['pass', 'passed']) }),
      Object.freeze({ label: 'Fail', aliases: Object.freeze(['fail', 'failed']) })
    ]),
    references: Object.freeze([
      Object.freeze(['unit_cameras', 'test_result_config_value_id']),
      Object.freeze(['unit_biometrics', 'test_result_config_value_id'])
    ])
  }),
  Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.LOCK_STATUSES,
    label: 'Lock Statuses',
    canonical: Object.freeze([
      Object.freeze({ label: 'Locked', aliases: Object.freeze(['locked']) }),
      Object.freeze({ label: 'Unlocked', aliases: Object.freeze(['unlocked']) })
    ]),
    references: Object.freeze([
      Object.freeze(['unit_specifications', 'bios_lock_config_value_id']),
      Object.freeze(['unit_specifications', 'efi_lock_config_value_id']),
      Object.freeze(['unit_specifications', 'mdm_lock_config_value_id']),
      Object.freeze(['unit_specifications', 'icloud_activation_lock_config_value_id'])
    ])
  })
]);

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase();
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
  if (!await tableExists(connection, tableName)) return new Set();
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

async function getCategoryId(connection, systemId) {
  const [rows] = await connection.query(
    `SELECT config_category_id
       FROM system_config_categories
      WHERE system_config_category_id = ?
      LIMIT 1`,
    [systemId]
  );
  const id = Number(rows[0]?.config_category_id || 0);
  if (!id) throw new Error(`System configuration category ${systemId} is not bound.`);
  return id;
}

async function normalizeCategoryLabel(connection, categoryId, label) {
  const columns = await getColumnSet(connection, 'config_categories');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  if (!labelColumn) return;
  await connection.query(
    `UPDATE config_categories SET ${q(labelColumn)} = ? WHERE config_category_id = ?`,
    [label, categoryId]
  );
}

async function loadCategoryValues(connection, categoryId) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const [rows] = await connection.query(
    `SELECT
       cv.config_value_id,
       ${labelColumn ? `cv.${q(labelColumn)}` : 'NULL'} AS label,
       ${columns.has('value') ? 'cv.value' : 'NULL'} AS value,
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

function matchesCanonical(row, definition) {
  return rowTokens(row).some((token) => definition.aliases.includes(token));
}

function isExactCanonical(row, definition) {
  return rowTokens(row).includes(normalizeToken(definition.label));
}

function buildCategoryPlan(rows, definition) {
  const canonical = definition.canonical.map((target) => {
    const matches = rows.filter((row) => matchesCanonical(row, target));
    const exact = matches.filter((row) => isExactCanonical(row, target));
    if (exact.length > 1) {
      throw new Error(`${definition.label} has multiple exact ${target.label} rows: ${exact.map((row) => row.config_value_id).join(', ')}.`);
    }
    const targetRow = exact[0] || matches[0] || null;
    const duplicateRows = targetRow ? matches.filter((row) => row.config_value_id !== targetRow.config_value_id) : [];
    return { definition: target, matches, targetRow, duplicateRows };
  });
  const recognized = new Set(canonical.flatMap((entry) => entry.matches.map((row) => row.config_value_id)));
  const retired = rows.filter((row) => !recognized.has(row.config_value_id));
  return { ...definition, rows, canonical, retired };
}

async function insertCanonicalValue(connection, categoryId, definition, sortOrder) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const fields = ['config_category_id'];
  const values = [categoryId];
  if (labelColumn) {
    fields.push(labelColumn);
    values.push(definition.label);
  }
  if (columns.has('value')) {
    fields.push('value');
    values.push(definition.label);
  }
  if (columns.has('sort_order')) {
    fields.push('sort_order');
    values.push(sortOrder);
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

async function normalizeCanonicalValue(connection, id, definition, sortOrder) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  const assignments = [];
  const params = [];
  if (labelColumn) {
    assignments.push(`${q(labelColumn)} = ?`);
    params.push(definition.label);
  }
  if (columns.has('value')) {
    assignments.push('value = ?');
    params.push(definition.label);
  }
  if (columns.has('sort_order')) {
    assignments.push('sort_order = ?');
    params.push(sortOrder);
  }
  if (columns.has('is_active')) assignments.push('is_active = 1');
  if (columns.has('is_protected')) assignments.push('is_protected = 1');
  if (!assignments.length) return;
  params.push(id);
  await connection.query(`UPDATE config_values SET ${assignments.join(', ')} WHERE config_value_id = ?`, params);
}

async function remapReferences(connection, tableName, columnName, sourceIds, targetId) {
  if (!sourceIds.length) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const ids = sourceIds.filter((id) => Number(id) !== Number(targetId));
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${q(tableName)} SET ${q(columnName)} = ? WHERE ${q(columnName)} IN (${placeholders})`,
    [targetId, ...ids]
  );
  return Number(result.affectedRows || 0);
}

async function clearReferences(connection, tableName, columnName, retiredIds) {
  if (!retiredIds.length) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const placeholders = retiredIds.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${q(tableName)} SET ${q(columnName)} = NULL WHERE ${q(columnName)} IN (${placeholders})`,
    retiredIds
  );
  return Number(result.affectedRows || 0);
}

async function deleteRetiredLotRequirements(connection, retiredIds) {
  if (!retiredIds.length) return 0;
  const columns = await getColumnSet(connection, 'lot_requirements');
  if (!columns.has('requirement_config_value_id')) return 0;
  const placeholders = retiredIds.map(() => '?').join(', ');
  const [result] = await connection.query(
    `DELETE FROM lot_requirements WHERE requirement_config_value_id IN (${placeholders})`,
    retiredIds
  );
  return Number(result.affectedRows || 0);
}

async function remapLotRequirements(connection, sourceIds, targetId) {
  return remapReferences(connection, 'lot_requirements', 'requirement_config_value_id', sourceIds, targetId);
}

async function deactivateValues(connection, ids) {
  if (!ids.length) return 0;
  const columns = await getColumnSet(connection, 'config_values');
  if (!columns.has('is_active')) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE config_values SET is_active = 0 WHERE config_value_id IN (${placeholders})`,
    ids
  );
  return Number(result.affectedRows || 0);
}

async function countReferences(connection, tableName, columnName, ids) {
  if (!ids.length) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count FROM ${q(tableName)} WHERE ${q(columnName)} IN (${placeholders})`,
    ids
  );
  return Number(rows[0]?.row_count || 0);
}

async function clearRankingCache(connection) {
  if (!await tableExists(connection, 'operational_option_usage_rankings')) return 0;
  const scopes = ['touchscreen_status', 'complete_diagnostics', 'virus_check_status', 'driver_check_status'];
  const placeholders = scopes.map(() => '?').join(', ');
  const [result] = await connection.query(
    `DELETE FROM operational_option_usage_rankings WHERE option_scope IN (${placeholders})`,
    scopes
  );
  return Number(result.affectedRows || 0);
}

async function validateCanonicalState(connection, resolved) {
  for (const definition of CATEGORY_PLANS) {
    const state = resolved.get(definition.systemId);
    if (!state) throw new Error(`Missing resolved state for system category ${definition.systemId}.`);
    const rows = await loadCategoryValues(connection, state.plan.categoryId);
    const activeLabels = rows
      .filter((row) => Number(row.is_active) === 1)
      .map((row) => String(row.label || row.value || '').trim());
    const expected = definition.canonical.map((entry) => entry.label);
    if (activeLabels.length !== expected.length || activeLabels.some((label, index) => label !== expected[index])) {
      throw new Error(`${definition.label} active values are ${activeLabels.join(', ') || '(none)'}; expected ${expected.join(', ')}.`);
    }
  }

  for (const tableName of ['unit_cameras', 'unit_biometrics']) {
    if (!await tableExists(connection, tableName)) continue;
    const columns = await getColumnSet(connection, tableName);
    if (!columns.has('test_result_config_value_id')) continue;
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS invalid_count
         FROM ${q(tableName)} component
         INNER JOIN config_values cv ON cv.config_value_id = component.test_result_config_value_id
         INNER JOIN system_config_categories scc ON scc.config_category_id = cv.config_category_id
        WHERE component.test_result_config_value_id IS NOT NULL
          AND scc.system_config_category_id <> ?`,
      [SYSTEM_CONFIG_CATEGORY_IDS.COMPONENT_TEST_RESULTS]
    );
    if (Number(rows[0]?.invalid_count || 0) > 0) {
      throw new Error(`${tableName} test rows still reference a non-component test-result category.`);
    }
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    for (const tableName of ['config_categories', 'config_values', 'system_config_categories', 'system_config_values']) {
      if (!await tableExists(connection, tableName)) throw new Error(`Required table ${tableName} is missing.`);
    }

    const plans = [];
    for (const definition of CATEGORY_PLANS) {
      const categoryId = await getCategoryId(connection, definition.systemId);
      const rows = await loadCategoryValues(connection, categoryId);
      plans.push({ categoryId, ...buildCategoryPlan(rows, definition) });
    }

    console.log('Canonical Tests & Checks option policy:');
    console.log('  Keyboard/Microphone/Audio/Touchscreen: Pass, Fail, Physically Not Present');
    console.log('  Camera/Biometrics/Diagnostics/Threat Protection/Driver: Pass, Fail');
    console.log('  BIOS/EFI/MDM/iCloud locks: Locked, Unlocked');
    console.log('  Tool uncertainty/not-run/non-applicability states are omitted rather than stored as form results.');

    for (const plan of plans) {
      console.log(`\n${plan.label} (system ${plan.systemId}, config category ${plan.categoryId})`);
      for (const entry of plan.canonical) {
        console.log(`  ${entry.definition.label}: ${entry.targetRow ? `target ${entry.targetRow.config_value_id}` : 'will be inserted'}`);
      }
      const duplicates = plan.canonical.flatMap((entry) => entry.duplicateRows);
      console.log(`  Duplicate aliases to merge/deactivate: ${duplicates.map((row) => `${row.config_value_id}:${row.label || row.value}`).join(', ') || '(none)'}`);
      console.log(`  Retired values: ${plan.retired.map((row) => `${row.config_value_id}:${row.label || row.value}`).join(', ') || '(none)'}`);
      const retiredIds = plan.retired.map((row) => row.config_value_id);
      for (const [tableName, columnName] of plan.references) {
        const count = await countReferences(connection, tableName, columnName, retiredIds);
        if (count) console.log(`    ${tableName}.${columnName} retired references: ${count}`);
      }
      const requirementCount = await countReferences(connection, 'lot_requirements', 'requirement_config_value_id', retiredIds);
      if (requirementCount) console.log(`    lot_requirements retired references: ${requirementCount}`);

      const nonCanonicalRows = [
        ...plan.retired,
        ...plan.canonical.flatMap((entry) => entry.duplicateRows)
      ];
      const boundNonCanonical = nonCanonicalRows.filter((row) => row.system_config_value_id != null);
      if (boundNonCanonical.length) {
        throw new Error(`${plan.label} has non-canonical rows with numeric system bindings: ${boundNonCanonical.map((row) => `${row.config_value_id}->${row.system_config_value_id}`).join(', ')}.`);
      }
    }

    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply after reviewing this audit.');
      return;
    }

    await connection.beginTransaction();
    const resolved = new Map();
    let referencesRemapped = 0;
    let referencesCleared = 0;
    let requirementsDeleted = 0;
    let valuesDeactivated = 0;

    for (const plan of plans) {
      await normalizeCategoryLabel(connection, plan.categoryId, plan.label);
      const targetIds = new Map();

      for (let index = 0; index < plan.canonical.length; index += 1) {
        const entry = plan.canonical[index];
        const targetId = entry.targetRow?.config_value_id
          || await insertCanonicalValue(connection, plan.categoryId, entry.definition, (index + 1) * 10);
        await normalizeCanonicalValue(connection, targetId, entry.definition, (index + 1) * 10);
        targetIds.set(entry.definition.label, targetId);
        referencesRemapped += await remapLotRequirements(connection, entry.matches.map((row) => row.config_value_id), targetId);
        for (const [tableName, columnName] of plan.references) {
          referencesRemapped += await remapReferences(connection, tableName, columnName, entry.matches.map((row) => row.config_value_id), targetId);
        }
      }

      const retiredIds = plan.retired.map((row) => row.config_value_id);
      for (const [tableName, columnName] of plan.references) {
        referencesCleared += await clearReferences(connection, tableName, columnName, retiredIds);
      }
      requirementsDeleted += await deleteRetiredLotRequirements(connection, retiredIds);
      const duplicateIds = plan.canonical.flatMap((entry) => entry.duplicateRows.map((row) => row.config_value_id));
      valuesDeactivated += await deactivateValues(connection, [...new Set([...retiredIds, ...duplicateIds])]);
      resolved.set(plan.systemId, { plan, targetIds });
    }

    const testResults = resolved.get(SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS);
    const componentResults = resolved.get(SYSTEM_CONFIG_CATEGORY_IDS.COMPONENT_TEST_RESULTS);
    if (testResults && componentResults) {
      const testPass = testResults.targetIds.get('Pass');
      const testFail = testResults.targetIds.get('Fail');
      const componentPass = componentResults.targetIds.get('Pass');
      const componentFail = componentResults.targetIds.get('Fail');
      const retiredSharedTestIds = testResults.plan.rows.map((row) => row.config_value_id)
        .filter((id) => ![testPass, testFail].includes(id));
      for (const tableName of ['unit_cameras', 'unit_biometrics']) {
        if (!await tableExists(connection, tableName)) continue;
        const columns = await getColumnSet(connection, tableName);
        if (!columns.has('test_result_config_value_id')) continue;
        referencesRemapped += await remapReferences(connection, tableName, 'test_result_config_value_id', [testPass], componentPass);
        referencesRemapped += await remapReferences(connection, tableName, 'test_result_config_value_id', [testFail], componentFail);
        referencesCleared += await clearReferences(connection, tableName, 'test_result_config_value_id', retiredSharedTestIds);
      }
    }

    const rankingRowsCleared = await clearRankingCache(connection);
    await validateCanonicalState(connection, resolved);
    await connection.commit();

    console.log('\nCanonical Tests & Checks option cleanup applied.');
    console.log(`References remapped: ${referencesRemapped}`);
    console.log(`Retired Unit/component references cleared: ${referencesCleared}`);
    console.log(`Retired Lot requirements deleted: ${requirementsDeleted}`);
    console.log(`Retired configuration values deactivated: ${valuesDeactivated}`);
    console.log(`Ranking cache rows cleared: ${rankingRowsCleared}`);
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
