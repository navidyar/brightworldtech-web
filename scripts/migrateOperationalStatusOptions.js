'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

const POLICY = Object.freeze({
  storageWipe: Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_WIPE_STATUSES,
    label: 'Storage Wipe Statuses',
    canonical: Object.freeze(['Wiped', 'Not Wiped', 'Wipe Failed']),
    retired: Object.freeze(['Unknown', 'N/A'])
  }),
  absolute: Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES,
    label: 'Absolute Statuses',
    canonical: Object.freeze([
      'Disabled',
      'Permanently Disabled',
      'Enabled',
      'Permanently Enabled',
      'HP Inactive Not Permanent',
      'HP Active Not Permanent',
      'HP Inactive Permanent',
      'HP Active Permanent',
      'Unavailable'
    ]),
    unavailableAliases: Object.freeze(['Unavailable', 'Not Detected']),
    remapToUnavailable: Object.freeze(['Unknown']),
    retired: Object.freeze(['N/A'])
  }),
  skinned: Object.freeze({
    systemId: SYSTEM_CONFIG_CATEGORY_IDS.SKINNED_STATUSES,
    label: 'Skinned Statuses',
    canonical: Object.freeze(['Arrived Skinned', 'Skinned by BWT', 'Not Skinned'])
  })
});

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalize(value) {
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

async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE AS column_type
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName]
  );
  const type = String(rows[0]?.column_type || '').trim();
  if (!type) throw new Error(`Cannot determine ${tableName}.${columnName} type.`);
  return type;
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

async function loadCategoryValues(connection, categoryId) {
  const [rows] = await connection.query(
    `SELECT config_value_id, label, value, COALESCE(sort_order, 0) AS sort_order,
            COALESCE(is_active, 1) AS is_active, COALESCE(is_protected, 0) AS is_protected
       FROM config_values
      WHERE config_category_id = ?
      ORDER BY COALESCE(sort_order, 0), config_value_id`,
    [categoryId]
  );
  return rows.map((row) => ({ ...row, config_value_id: Number(row.config_value_id) }));
}

function findByLabels(rows, labels) {
  const tokens = new Set(labels.map(normalize));
  return rows.find((row) => tokens.has(normalize(row.label)) || tokens.has(normalize(row.value))) || null;
}

function findAllByLabels(rows, labels) {
  const tokens = new Set(labels.map(normalize));
  return rows.filter((row) => tokens.has(normalize(row.label)) || tokens.has(normalize(row.value)));
}

async function insertValue(connection, categoryId, label, sortOrder) {
  const [result] = await connection.query(
    `INSERT INTO config_values
       (config_category_id, label, value, sort_order, is_active, is_protected)
     VALUES (?, ?, ?, ?, 1, 1)`,
    [categoryId, label, label, sortOrder]
  );
  return Number(result.insertId);
}

async function normalizeValue(connection, id, label, sortOrder) {
  await connection.query(
    `UPDATE config_values
        SET label = ?, value = ?, sort_order = ?, is_active = 1, is_protected = 1
      WHERE config_value_id = ?`,
    [label, label, sortOrder, id]
  );
}

async function deactivateValues(connection, ids) {
  const safeIds = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!safeIds.length) return 0;
  const placeholders = safeIds.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE config_values SET is_active = 0 WHERE config_value_id IN (${placeholders})`,
    safeIds
  );
  return Number(result.affectedRows || 0);
}

async function countReferences(connection, tableName, columnName, ids) {
  if (!ids.length || !await tableExists(connection, tableName)) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count FROM ${q(tableName)} WHERE ${q(columnName)} IN (${placeholders})`,
    ids
  );
  return Number(rows[0]?.row_count || 0);
}

async function clearReferences(connection, tableName, columnName, ids) {
  if (!ids.length || !await tableExists(connection, tableName)) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${q(tableName)} SET ${q(columnName)} = NULL WHERE ${q(columnName)} IN (${placeholders})`,
    ids
  );
  return Number(result.affectedRows || 0);
}

async function remapReferences(connection, tableName, columnName, sourceIds, targetId) {
  const ids = [...new Set(sourceIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0 && id !== targetId))];
  if (!ids.length || !await tableExists(connection, tableName)) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${q(tableName)} SET ${q(columnName)} = ? WHERE ${q(columnName)} IN (${placeholders})`,
    [targetId, ...ids]
  );
  return Number(result.affectedRows || 0);
}

async function deleteLotRequirements(connection, ids) {
  if (!ids.length || !await tableExists(connection, 'lot_requirements')) return 0;
  const columns = await getColumnSet(connection, 'lot_requirements');
  if (!columns.has('requirement_config_value_id')) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `DELETE FROM lot_requirements WHERE requirement_config_value_id IN (${placeholders})`,
    ids
  );
  return Number(result.affectedRows || 0);
}

async function remapLotRequirements(connection, sourceIds, targetId) {
  return remapReferences(connection, 'lot_requirements', 'requirement_config_value_id', sourceIds, targetId);
}

async function ensureSkinningMetadataColumns(connection) {
  if (!await tableExists(connection, 'unit_specifications')) {
    throw new Error('unit_specifications is required.');
  }
  let columns = await getColumnSet(connection, 'unit_specifications');
  const userIdType = await getColumnType(connection, 'users', 'user_id');

  if (!columns.has('skinned_by_user_id')) {
    await connection.query(`ALTER TABLE unit_specifications ADD COLUMN skinned_by_user_id ${userIdType} NULL AFTER skinned_status_config_value_id`);
    columns = await getColumnSet(connection, 'unit_specifications');
  }
  if (!columns.has('skinned_at')) {
    await connection.query('ALTER TABLE unit_specifications ADD COLUMN skinned_at DATETIME NULL AFTER skinned_by_user_id');
  }

  const [indexRows] = await connection.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_specifications'
        AND COLUMN_NAME = 'skinned_by_user_id' LIMIT 1`
  );
  if (!indexRows.length) {
    await connection.query('ALTER TABLE unit_specifications ADD KEY idx_unit_specs_skinned_by (skinned_by_user_id)');
  }

  const [fkRows] = await connection.query(
    `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_specifications'
        AND COLUMN_NAME = 'skinned_by_user_id' AND REFERENCED_TABLE_NAME = 'users' LIMIT 1`
  );
  if (!fkRows.length) {
    await connection.query(
      `ALTER TABLE unit_specifications
       ADD CONSTRAINT fk_unit_specs_skinned_by
       FOREIGN KEY (skinned_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL`
    );
  }
}

async function clearRankingCache(connection) {
  if (!await tableExists(connection, 'operational_option_usage_rankings')) return 0;
  const scopes = ['storage_wipe_status', 'absolute_status', 'skinned_status'];
  const placeholders = scopes.map(() => '?').join(', ');
  const [result] = await connection.query(
    `DELETE FROM operational_option_usage_rankings WHERE option_scope IN (${placeholders})`,
    scopes
  );
  return Number(result.affectedRows || 0);
}

async function validateActiveLabels(connection, categoryId, expectedLabels, name) {
  const rows = await loadCategoryValues(connection, categoryId);
  const activeLabels = rows.filter((row) => Number(row.is_active) === 1).map((row) => String(row.label || row.value || '').trim());
  if (activeLabels.length !== expectedLabels.length || activeLabels.some((label, index) => label !== expectedLabels[index])) {
    throw new Error(`${name} active values are ${activeLabels.join(', ') || '(none)'}; expected ${expectedLabels.join(', ')}.`);
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    for (const tableName of ['config_values', 'system_config_categories', 'unit_specifications']) {
      if (!await tableExists(connection, tableName)) throw new Error(`Required table ${tableName} is missing.`);
    }

    const storageCategoryId = await getCategoryId(connection, POLICY.storageWipe.systemId);
    const absoluteCategoryId = await getCategoryId(connection, POLICY.absolute.systemId);
    const skinnedCategoryId = await getCategoryId(connection, POLICY.skinned.systemId);
    const storageRows = await loadCategoryValues(connection, storageCategoryId);
    const absoluteRows = await loadCategoryValues(connection, absoluteCategoryId);
    const skinnedRows = await loadCategoryValues(connection, skinnedCategoryId);

    const storageRetired = findAllByLabels(storageRows, POLICY.storageWipe.retired);
    const absoluteUnavailable = findByLabels(absoluteRows, POLICY.absolute.unavailableAliases);
    const absoluteUnknown = findAllByLabels(absoluteRows, POLICY.absolute.remapToUnavailable);
    const absoluteRetired = findAllByLabels(absoluteRows, POLICY.absolute.retired);
    const skinnedCanonicalTokens = new Set(POLICY.skinned.canonical.map(normalize));
    const oldSkinnedIds = skinnedRows
      .filter((row) => !skinnedCanonicalTokens.has(normalize(row.label)) && !skinnedCanonicalTokens.has(normalize(row.value)))
      .map((row) => row.config_value_id);

    console.log('Operational status option policy:');
    console.log('  Storage Wipe Status: Wiped, Not Wiped, Wipe Failed');
    console.log('  Absolute Status: existing meaningful states plus Unavailable');
    console.log('  Skinning Status: Arrived Skinned, Skinned by BWT, Not Skinned');
    console.log('  Skinned by BWT automatically records the acting BWTDallas user and timestamp.');

    console.log(`\nStorage Wipe Statuses (system ${POLICY.storageWipe.systemId}, config category ${storageCategoryId})`);
    console.log(`  Retired values: ${storageRetired.map((row) => `${row.config_value_id}:${row.label || row.value}`).join(', ') || '(none)'}`);
    console.log(`  Current storage retired references: ${await countReferences(connection, 'unit_storage_devices', 'wipe_status_config_value_id', storageRetired.map((row) => row.config_value_id))}`);
    console.log(`  Previous storage retired references: ${await countReferences(connection, 'unit_previous_storage_devices', 'wipe_status_config_value_id', storageRetired.map((row) => row.config_value_id))}`);
    console.log(`  Lot requirement retired references: ${await countReferences(connection, 'lot_requirements', 'requirement_config_value_id', storageRetired.map((row) => row.config_value_id))}`);

    console.log(`\nAbsolute Statuses (system ${POLICY.absolute.systemId}, config category ${absoluteCategoryId})`);
    console.log(`  Unavailable target: ${absoluteUnavailable ? `${absoluteUnavailable.config_value_id}:${absoluteUnavailable.label || absoluteUnavailable.value}` : 'will be inserted'}`);
    console.log(`  Values remapped to Unavailable: ${absoluteUnknown.map((row) => `${row.config_value_id}:${row.label || row.value}`).join(', ') || '(none)'}`);
    console.log(`  Retired values cleared: ${absoluteRetired.map((row) => `${row.config_value_id}:${row.label || row.value}`).join(', ') || '(none)'}`);
    console.log(`  Unit references remapped to Unavailable: ${await countReferences(connection, 'unit_specifications', 'absolute_status_config_value_id', absoluteUnknown.map((row) => row.config_value_id))}`);
    console.log(`  Unit retired references cleared: ${await countReferences(connection, 'unit_specifications', 'absolute_status_config_value_id', absoluteRetired.map((row) => row.config_value_id))}`);

    console.log(`\nSkinned Statuses (system ${POLICY.skinned.systemId}, config category ${skinnedCategoryId})`);
    console.log(`  Existing values to retire: ${skinnedRows.map((row) => `${row.config_value_id}:${row.label || row.value}`).join(', ') || '(none)'}`);
    console.log(`  Existing Unit references to clear: ${await countReferences(connection, 'unit_specifications', 'skinned_status_config_value_id', oldSkinnedIds)}`);
    console.log(`  Existing Lot requirement references to delete: ${await countReferences(connection, 'lot_requirements', 'requirement_config_value_id', oldSkinnedIds)}`);

    if (!APPLY) {
      const columns = await getColumnSet(connection, 'unit_specifications');
      console.log(`  skinned_by_user_id column: ${columns.has('skinned_by_user_id') ? 'present' : 'will be added'}`);
      console.log(`  skinned_at column: ${columns.has('skinned_at') ? 'present' : 'will be added'}`);
      console.log('\nNo database changes were made. Re-run with --apply after reviewing this audit.');
      return;
    }

    await ensureSkinningMetadataColumns(connection);
    await connection.beginTransaction();

    let referencesRemapped = 0;
    let referencesCleared = 0;
    let requirementsDeleted = 0;
    let valuesDeactivated = 0;

    const storageTargets = new Map();
    for (let index = 0; index < POLICY.storageWipe.canonical.length; index += 1) {
      const label = POLICY.storageWipe.canonical[index];
      const existing = findByLabels(storageRows, [label]);
      if (!existing) throw new Error(`Storage Wipe Statuses is missing canonical value ${label}.`);
      await normalizeValue(connection, existing.config_value_id, label, (index + 1) * 10);
      storageTargets.set(label, existing.config_value_id);
    }
    const storageRetiredIds = storageRetired.map((row) => row.config_value_id);
    referencesCleared += await clearReferences(connection, 'unit_storage_devices', 'wipe_status_config_value_id', storageRetiredIds);
    referencesCleared += await clearReferences(connection, 'unit_previous_storage_devices', 'wipe_status_config_value_id', storageRetiredIds);
    requirementsDeleted += await deleteLotRequirements(connection, storageRetiredIds);
    valuesDeactivated += await deactivateValues(connection, storageRetiredIds);

    const absoluteTargetIds = new Map();
    for (let index = 0; index < POLICY.absolute.canonical.length; index += 1) {
      const label = POLICY.absolute.canonical[index];
      const aliases = label === 'Unavailable' ? POLICY.absolute.unavailableAliases : [label];
      const existing = findByLabels(absoluteRows, aliases);
      const targetId = existing?.config_value_id || await insertValue(connection, absoluteCategoryId, label, (index + 1) * 10);
      await normalizeValue(connection, targetId, label, (index + 1) * 10);
      absoluteTargetIds.set(label, targetId);
    }
    const unavailableId = absoluteTargetIds.get('Unavailable');
    const absoluteUnknownIds = absoluteUnknown.map((row) => row.config_value_id).filter((id) => id !== unavailableId);
    referencesRemapped += await remapReferences(connection, 'unit_specifications', 'absolute_status_config_value_id', absoluteUnknownIds, unavailableId);
    referencesRemapped += await remapLotRequirements(connection, absoluteUnknownIds, unavailableId);
    const absoluteRetiredIds = absoluteRetired.map((row) => row.config_value_id).filter((id) => id !== unavailableId);
    referencesCleared += await clearReferences(connection, 'unit_specifications', 'absolute_status_config_value_id', absoluteRetiredIds);
    requirementsDeleted += await deleteLotRequirements(connection, absoluteRetiredIds);
    valuesDeactivated += await deactivateValues(connection, [...absoluteUnknownIds, ...absoluteRetiredIds]);

    if (oldSkinnedIds.length) {
      const placeholders = oldSkinnedIds.map(() => '?').join(', ');
      await connection.query(
        `UPDATE unit_specifications
            SET skinned_by_user_id = NULL, skinned_at = NULL
          WHERE skinned_status_config_value_id IN (${placeholders})`,
        oldSkinnedIds
      );
    }
    referencesCleared += await clearReferences(connection, 'unit_specifications', 'skinned_status_config_value_id', oldSkinnedIds);
    requirementsDeleted += await deleteLotRequirements(connection, oldSkinnedIds);
    valuesDeactivated += await deactivateValues(connection, oldSkinnedIds);

    for (let index = 0; index < POLICY.skinned.canonical.length; index += 1) {
      const label = POLICY.skinned.canonical[index];
      const currentRows = await loadCategoryValues(connection, skinnedCategoryId);
      const existing = findByLabels(currentRows, [label]);
      const targetId = existing?.config_value_id || await insertValue(connection, skinnedCategoryId, label, (index + 1) * 10);
      await normalizeValue(connection, targetId, label, (index + 1) * 10);
    }

    const rankingRowsCleared = await clearRankingCache(connection);

    await validateActiveLabels(connection, storageCategoryId, POLICY.storageWipe.canonical, POLICY.storageWipe.label);
    await validateActiveLabels(connection, absoluteCategoryId, POLICY.absolute.canonical, POLICY.absolute.label);
    await validateActiveLabels(connection, skinnedCategoryId, POLICY.skinned.canonical, POLICY.skinned.label);

    await connection.commit();

    console.log('\nOperational status option cleanup applied.');
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
