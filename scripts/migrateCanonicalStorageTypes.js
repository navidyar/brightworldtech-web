'use strict';
require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');
const SATA_CANONICAL_VALUE = 'sata';
const SATA_CANONICAL_LABEL = 'SATA';
const NVME_CANONICAL_VALUE = 'nvme';
const NVME_CANONICAL_LABEL = 'NVMe';
const LEGACY_SATA_VALUE = 'sata_legacy_merged';
const LEGACY_SATA_LABEL = 'Legacy SATA (merged)';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

async function getStorageCategoryId(connection) {
  const [[row]] = await connection.query(
    `SELECT config_category_id
       FROM system_config_categories
      WHERE system_config_category_id = ?
      LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES]
  );
  if (!row?.config_category_id) throw new Error('Storage Types system configuration category is not bound.');
  return Number(row.config_category_id);
}

async function listStorageValues(connection, categoryId) {
  const [rows] = await connection.query(
    `SELECT config_value_id, value, label, is_active, sort_order
       FROM config_values
      WHERE config_category_id = ?
      ORDER BY sort_order, config_value_id`,
    [categoryId]
  );
  return rows.map((row) => ({
    id: Number(row.config_value_id),
    value: row.value || '',
    label: row.label || '',
    active: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order || 0)
  }));
}

function findValue(rows, candidates) {
  const keys = new Set(candidates.map(normalizeKey));
  return rows.find((row) => keys.has(normalizeKey(row.value))) || null;
}

async function countReferences(connection, configValueId) {
  const id = Number(configValueId);
  const queries = [
    ['units', 'storage_type_config_value_id'],
    ['unit_storage_devices', 'storage_type_config_value_id'],
    ['unit_previous_storage_devices', 'storage_type_config_value_id'],
    ['lot_requirements', 'requirement_config_value_id']
  ];
  const result = {};
  for (const [table, column] of queries) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`, [id]);
    result[`${table}.${column}`] = Number(row.count || 0);
  }
  const [[ranking]] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM operational_option_usage_rankings
      WHERE option_scope = 'storage_type' AND option_key = ?`,
    [String(id)]
  );
  result['operational_option_usage_rankings.storage_type'] = Number(ranking.count || 0);
  return result;
}

async function inspect(connection) {
  const categoryId = await getStorageCategoryId(connection);
  const rows = await listStorageValues(connection, categoryId);
  const sata = findValue(rows, ['sata', 'sata_2_5']);
  const legacySata = findValue(rows, ['m2_sata', 'sata_legacy_merged']);
  const nvme = findValue(rows, ['nvme', 'm2_nvme']);
  if (!sata) throw new Error('Could not find the SATA/2.5 SATA Storage Type row.');
  if (!nvme) throw new Error('Could not find the NVMe/M.2 NVMe Storage Type row.');
  return {
    categoryId,
    rows,
    sata,
    legacySata,
    nvme,
    references: {
      sata: await countReferences(connection, sata.id),
      legacySata: legacySata ? await countReferences(connection, legacySata.id) : {},
      nvme: await countReferences(connection, nvme.id)
    }
  };
}

function printState(state, label) {
  console.log(`${label}:`);
  console.log(`  Storage Types category: #${state.categoryId}`);
  console.log(`  SATA: #${state.sata.id} ${state.sata.value} / ${state.sata.label} active=${state.sata.active}`);
  console.log(`  Legacy SATA: ${state.legacySata ? `#${state.legacySata.id} ${state.legacySata.value} / ${state.legacySata.label} active=${state.legacySata.active}` : 'none'}`);
  console.log(`  NVMe: #${state.nvme.id} ${state.nvme.value} / ${state.nvme.label} active=${state.nvme.active}`);
  if (state.legacySata) console.log(`  Legacy SATA references: ${JSON.stringify(state.references.legacySata)}`);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    console.log(`Canonical Storage Types migration (${APPLY ? 'apply' : 'audit'})`);
    printState(before, 'Before');
    if (!APPLY) return;

    await connection.beginTransaction();
    try {
      const sataId = before.sata.id;
      const nvmeId = before.nvme.id;
      const legacySataId = before.legacySata && before.legacySata.id !== sataId ? before.legacySata.id : null;

      if (legacySataId) {
        await connection.query('UPDATE units SET storage_type_config_value_id = ? WHERE storage_type_config_value_id = ?', [sataId, legacySataId]);
        await connection.query('UPDATE unit_storage_devices SET storage_type_config_value_id = ? WHERE storage_type_config_value_id = ?', [sataId, legacySataId]);
        await connection.query('UPDATE unit_previous_storage_devices SET storage_type_config_value_id = ? WHERE storage_type_config_value_id = ?', [sataId, legacySataId]);
        await connection.query('UPDATE lot_requirements SET requirement_config_value_id = ? WHERE requirement_config_value_id = ?', [sataId, legacySataId]);
        await connection.query(
          `UPDATE config_values
              SET value = ?, label = ?, is_active = 0
            WHERE config_value_id = ?`,
          [LEGACY_SATA_VALUE, LEGACY_SATA_LABEL, legacySataId]
        );
      }

      await connection.query(
        `UPDATE config_values SET value = ?, label = ?, is_active = 1 WHERE config_value_id = ?`,
        [SATA_CANONICAL_VALUE, SATA_CANONICAL_LABEL, sataId]
      );
      await connection.query(
        `UPDATE config_values SET value = ?, label = ?, is_active = 1 WHERE config_value_id = ?`,
        [NVME_CANONICAL_VALUE, NVME_CANONICAL_LABEL, nvmeId]
      );

      // This table is a derived cache. Clear only Storage Type rows so a normal refresh rebuilds truthful counts.
      await connection.query("DELETE FROM operational_option_usage_rankings WHERE option_scope = 'storage_type'");
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const after = await inspect(connection);
    printState(after, 'After');
    const activeSataRows = after.rows.filter((row) => row.active && normalizeKey(row.value) === SATA_CANONICAL_VALUE);
    const activeNvmeRows = after.rows.filter((row) => row.active && normalizeKey(row.value) === NVME_CANONICAL_VALUE);
    if (activeSataRows.length !== 1) throw new Error(`Expected one active canonical SATA row, found ${activeSataRows.length}.`);
    if (activeNvmeRows.length !== 1) throw new Error(`Expected one active canonical NVMe row, found ${activeNvmeRows.length}.`);
    if (after.legacySata && after.legacySata.id !== after.sata.id) {
      const refs = Object.entries(after.references.legacySata).filter(([key]) => key !== 'operational_option_usage_rankings.storage_type');
      const remaining = refs.filter(([, count]) => Number(count) !== 0);
      if (remaining.length) throw new Error(`Legacy SATA references remain: ${JSON.stringify(remaining)}`);
      if (after.legacySata.active) throw new Error('Legacy SATA row is still active.');
    }
    console.log('Canonical Storage Types migration verified.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
