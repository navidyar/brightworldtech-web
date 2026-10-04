'use strict';

const crypto = require('crypto');
const { pool } = require('../models/db');

async function listAliases(connection) {
  try {
    const [rows] = await connection.query(`
      SELECT a.config_category_id,a.alias_value,a.normalized_alias,a.target_config_value_id
        FROM tool_config_value_aliases a
        JOIN config_values target ON target.config_value_id=a.target_config_value_id
       WHERE COALESCE(a.is_active,1)=1 AND COALESCE(target.is_active,1)=1
       ORDER BY a.config_category_id,a.tool_config_value_alias_id`);
    return rows;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146) return [];
    throw error;
  }
}

async function getManifest() {
  const connection = await pool.getConnection();
  try {
    const [categoryRows, valueRows, aliasRows] = await Promise.all([
      connection.query(`
        SELECT cc.config_category_id,cc.name,cc.description,cc.is_active,scc.system_config_category_id
          FROM config_categories cc
          LEFT JOIN system_config_categories scc ON scc.config_category_id=cc.config_category_id
         WHERE COALESCE(cc.is_active,1)=1
         ORDER BY COALESCE(scc.system_config_category_id,65535),cc.config_category_id`).then(([rows]) => rows),
      connection.query(`
        SELECT cv.config_value_id,cv.config_category_id,cv.label,cv.value,cv.sort_order
          FROM config_values cv
          JOIN config_categories cc ON cc.config_category_id=cv.config_category_id
         WHERE COALESCE(cc.is_active,1)=1 AND COALESCE(cv.is_active,1)=1
         ORDER BY cv.config_category_id,cv.sort_order,cv.config_value_id`).then(([rows]) => rows),
      listAliases(connection)
    ]);

    const valuesByCategory = new Map();
    for (const row of valueRows) {
      const key = Number(row.config_category_id);
      if (!valuesByCategory.has(key)) valuesByCategory.set(key, []);
      valuesByCategory.get(key).push({
        config_value_id: Number(row.config_value_id),
        label: String(row.label || ''),
        value: row.value === null || row.value === undefined ? null : String(row.value),
        sort_order: Number(row.sort_order || 0)
      });
    }
    const aliasesByCategory = new Map();
    for (const row of aliasRows) {
      const key = Number(row.config_category_id);
      if (!aliasesByCategory.has(key)) aliasesByCategory.set(key, []);
      aliasesByCategory.get(key).push({
        alias: String(row.alias_value || ''),
        normalized_alias: String(row.normalized_alias || ''),
        target_config_value_id: Number(row.target_config_value_id)
      });
    }

    const categories = categoryRows.map((row) => ({
      system_config_category_id: Number(row.system_config_category_id) || null,
      config_category_id: Number(row.config_category_id),
      name: String(row.name || ''),
      description: String(row.description || ''),
      values: valuesByCategory.get(Number(row.config_category_id)) || [],
      aliases: aliasesByCategory.get(Number(row.config_category_id)) || []
    }));
    const canonical = JSON.stringify(categories);
    const configurationVersion = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24);
    return {
      contract_version: 1,
      configuration_version: configurationVersion,
      generated_at: new Date().toISOString(),
      categories
    };
  } finally {
    connection.release();
  }
}

module.exports = { getManifest };
