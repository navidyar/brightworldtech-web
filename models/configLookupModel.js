'use strict';

const { pool } = require('./db');

function normalizeSystemIds(values) {
  const source = Array.isArray(values) ? values : [values];
  return Array.from(new Set(source
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0)));
}

async function listConfigValuesBySystemCategoryIds(systemCategoryIds, options = {}, connection = pool) {
  const ids = normalizeSystemIds(systemCategoryIds);
  if (ids.length === 0) return [];

  const includeInactive = options.includeInactive === true;
  const placeholders = ids.map(() => '?').join(', ');
  const orderPlaceholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT
       scc.system_config_category_id,
       cv.config_value_id,
       scv.system_config_value_id,
       COALESCE(cv.label, cv.value, CONCAT('Value #', cv.config_value_id)) AS label,
       cv.value,
       COALESCE(cv.sort_order, 0) AS sort_order,
       COALESCE(cv.is_active, 1) AS is_active,
       COALESCE(cv.is_protected, 0) AS is_protected
     FROM system_config_categories scc
     INNER JOIN config_values cv
       ON cv.config_category_id = scc.config_category_id
     LEFT JOIN system_config_values scv
       ON scv.config_value_id = cv.config_value_id
     WHERE scc.system_config_category_id IN (${placeholders})
       ${includeInactive ? '' : 'AND COALESCE(cv.is_active, 1) = 1'}
     ORDER BY FIELD(scc.system_config_category_id, ${orderPlaceholders}),
       COALESCE(cv.sort_order, 0), label, cv.config_value_id`,
    [...ids, ...ids]
  );

  return rows.map((row) => ({
    id: Number(row.config_value_id),
    configValueId: Number(row.config_value_id),
    systemConfigCategoryId: Number(row.system_config_category_id),
    systemConfigValueId: row.system_config_value_id == null ? null : Number(row.system_config_value_id),
    label: row.label,
    value: row.value,
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1,
    isProtected: Number(row.is_protected) === 1
  }));
}

async function getConfigValueBySystemId(systemConfigValueId, connection = pool) {
  const systemId = Number(systemConfigValueId);
  if (!Number.isSafeInteger(systemId) || systemId <= 0) return null;

  const [rows] = await connection.query(
    `SELECT
       scc.system_config_category_id,
       cv.config_value_id,
       scv.system_config_value_id,
       COALESCE(cv.label, cv.value, CONCAT('Value #', cv.config_value_id)) AS label,
       cv.value,
       COALESCE(cv.sort_order, 0) AS sort_order,
       COALESCE(cv.is_active, 1) AS is_active,
       COALESCE(cv.is_protected, 0) AS is_protected
     FROM system_config_values scv
     INNER JOIN config_values cv
       ON cv.config_value_id = scv.config_value_id
     INNER JOIN system_config_categories scc
       ON scc.config_category_id = cv.config_category_id
     WHERE scv.system_config_value_id = ?
     LIMIT 1`,
    [systemId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.config_value_id),
    configValueId: Number(row.config_value_id),
    systemConfigCategoryId: Number(row.system_config_category_id),
    systemConfigValueId: Number(row.system_config_value_id),
    label: row.label,
    value: row.value,
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1,
    isProtected: Number(row.is_protected) === 1
  };
}

async function getConfigValueIdBySystemId(systemConfigValueId, connection = pool) {
  const value = await getConfigValueBySystemId(systemConfigValueId, connection);
  return value ? value.configValueId : null;
}

module.exports = {
  getConfigValueBySystemId,
  getConfigValueIdBySystemId,
  listConfigValuesBySystemCategoryIds
};
