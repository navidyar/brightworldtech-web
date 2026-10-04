'use strict';

const { pool } = require('./db');

function normalizeText(value, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeAlias(value) {
  return normalizeText(value, 255).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function positiveInt(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function aliasError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function getCategory(configCategoryId, connection = pool) {
  const id = positiveInt(configCategoryId);
  if (!id) return null;
  const [rows] = await connection.query(`
    SELECT cc.config_category_id, cc.name, cc.description, cc.is_active,
           scc.system_config_category_id
      FROM config_categories cc
      LEFT JOIN system_config_categories scc ON scc.config_category_id=cc.config_category_id
     WHERE cc.config_category_id=? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function listActiveValues(configCategoryId, connection = pool) {
  const id = positiveInt(configCategoryId);
  if (!id) return [];
  const [rows] = await connection.query(`
    SELECT config_value_id,label,value,sort_order,is_active
      FROM config_values
     WHERE config_category_id=? AND COALESCE(is_active,1)=1
     ORDER BY sort_order,config_value_id`, [id]);
  return rows;
}

async function listAliases(configCategoryId, connection = pool) {
  const id = positiveInt(configCategoryId);
  if (!id) return [];
  try {
    const [rows] = await connection.query(`
      SELECT a.tool_config_value_alias_id,a.config_category_id,a.alias_value,a.normalized_alias,
             a.target_config_value_id,a.is_active,a.created_at,a.updated_at,
             cv.label AS target_label,cv.value AS target_value,cv.is_active AS target_is_active
        FROM tool_config_value_aliases a
        JOIN config_values cv ON cv.config_value_id=a.target_config_value_id AND cv.config_category_id=a.config_category_id
       WHERE a.config_category_id=?
       ORDER BY a.alias_value,a.tool_config_value_alias_id`, [id]);
    return rows;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146) return [];
    throw error;
  }
}

async function createAlias({ configCategoryId, aliasValue, targetConfigValueId, userId }) {
  const categoryId = positiveInt(configCategoryId);
  const targetId = positiveInt(targetConfigValueId);
  const actorId = positiveInt(userId);
  const rawAlias = normalizeText(aliasValue, 255);
  const normalizedAlias = normalizeAlias(rawAlias);
  if (!categoryId || !targetId) throw aliasError('TOOL_ALIAS_INVALID_TARGET', 'Choose a valid Configuration category and target value.');
  if (!rawAlias || !normalizedAlias) throw aliasError('TOOL_ALIAS_REQUIRED', 'Enter the raw Tool value to map.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const category = await getCategory(categoryId, connection);
    if (!category) throw aliasError('TOOL_ALIAS_CATEGORY_NOT_FOUND', 'The Configuration category could not be found.', 404);
    if (!category.system_config_category_id) throw aliasError('TOOL_ALIAS_CATEGORY_NOT_SYSTEM_USED', 'Tool aliases are available only for system-used Configuration categories.');

    const [targets] = await connection.query(`
      SELECT config_value_id,label,value,is_active
        FROM config_values
       WHERE config_value_id=? AND config_category_id=? LIMIT 1 FOR UPDATE`, [targetId, categoryId]);
    const target = targets[0] || null;
    if (!target || Number(target.is_active) !== 1) throw aliasError('TOOL_ALIAS_TARGET_INACTIVE', 'Choose an active target Configuration value.');

    const [canonicalRows] = await connection.query(`
      SELECT config_value_id,label,value
        FROM config_values
       WHERE config_category_id=? AND COALESCE(is_active,1)=1`, [categoryId]);
    const canonicalConflict = canonicalRows.find((row) => [row.label, row.value].some((v) => normalizeAlias(v) === normalizedAlias));
    if (canonicalConflict) {
      throw aliasError('TOOL_ALIAS_MATCHES_CANONICAL_VALUE', `“${rawAlias}” already resolves directly to active value “${canonicalConflict.label}”; no alias is needed.`);
    }

    const [existing] = await connection.query(`
      SELECT tool_config_value_alias_id,target_config_value_id
        FROM tool_config_value_aliases
       WHERE config_category_id=? AND normalized_alias=? LIMIT 1 FOR UPDATE`, [categoryId, normalizedAlias]);
    if (existing[0]) {
      if (Number(existing[0].target_config_value_id) === targetId) {
        await connection.query(`UPDATE tool_config_value_aliases SET alias_value=?,is_active=1,updated_by_user_id=? WHERE tool_config_value_alias_id=?`, [rawAlias, actorId, existing[0].tool_config_value_alias_id]);
      } else {
        throw aliasError('TOOL_ALIAS_ALREADY_MAPPED', 'That raw Tool value is already mapped to a different Configuration value.', 409);
      }
    } else {
      await connection.query(`
        INSERT INTO tool_config_value_aliases
          (config_category_id,alias_value,normalized_alias,target_config_value_id,is_active,created_by_user_id,updated_by_user_id)
        VALUES (?,?,?,?,1,?,?)`, [categoryId, rawAlias, normalizedAlias, targetId, actorId, actorId]);
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteAlias({ aliasId, configCategoryId = null }) {
  const id = positiveInt(aliasId);
  const categoryId = positiveInt(configCategoryId);
  if (!id) throw aliasError('TOOL_ALIAS_NOT_FOUND', 'The selected Tool alias could not be found.', 404);
  const params = [id];
  let sql = 'DELETE FROM tool_config_value_aliases WHERE tool_config_value_alias_id=?';
  if (categoryId) { sql += ' AND config_category_id=?'; params.push(categoryId); }
  const [result] = await pool.query(sql, params);
  if (Number(result.affectedRows || 0) !== 1) throw aliasError('TOOL_ALIAS_NOT_FOUND', 'The selected Tool alias could not be found.', 404);
  return true;
}


async function preserveRenamedValueAliases({
  configValueId,
  configCategoryId,
  previousLabel,
  previousValue,
  userId
}) {
  const targetId = positiveInt(configValueId);
  const categoryId = positiveInt(configCategoryId);
  const actorId = positiveInt(userId);
  if (!targetId || !categoryId) return 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const category = await getCategory(categoryId, connection);
    if (!category?.system_config_category_id) {
      await connection.commit();
      return 0;
    }
    const [targets] = await connection.query(`
      SELECT config_value_id,label,value,is_active,config_category_id
        FROM config_values
       WHERE config_value_id=? LIMIT 1 FOR UPDATE`, [targetId]);
    const target = targets[0] || null;
    if (!target || Number(target.config_category_id) !== categoryId || Number(target.is_active) !== 1) {
      await connection.commit();
      return 0;
    }
    const currentKeys = new Set([target.label, target.value].map(normalizeAlias).filter(Boolean));
    const candidates = [...new Set([previousLabel, previousValue].map((v) => normalizeText(v,255)).filter(Boolean))];
    let inserted = 0;
    for (const rawAlias of candidates) {
      const normalizedAlias = normalizeAlias(rawAlias);
      if (!normalizedAlias || currentKeys.has(normalizedAlias)) continue;
      const [existing] = await connection.query(`
        SELECT tool_config_value_alias_id,target_config_value_id
          FROM tool_config_value_aliases
         WHERE config_category_id=? AND normalized_alias=? LIMIT 1 FOR UPDATE`, [categoryId, normalizedAlias]);
      if (existing[0] && Number(existing[0].target_config_value_id) !== targetId) continue;
      if (existing[0]) {
        await connection.query(`UPDATE tool_config_value_aliases SET alias_value=?,is_active=1,updated_by_user_id=? WHERE tool_config_value_alias_id=?`, [rawAlias, actorId, existing[0].tool_config_value_alias_id]);
      } else {
        await connection.query(`
          INSERT INTO tool_config_value_aliases
            (config_category_id,alias_value,normalized_alias,target_config_value_id,is_active,created_by_user_id,updated_by_user_id)
          VALUES (?,?,?,?,1,?,?)`, [categoryId,rawAlias,normalizedAlias,targetId,actorId,actorId]);
      }
      inserted += 1;
    }
    await connection.commit();
    return inserted;
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146) return 0;
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteAliasesForMovedTarget({ configValueId, currentCategoryId }) {
  const targetId = positiveInt(configValueId);
  const categoryId = positiveInt(currentCategoryId);
  if (!targetId || !categoryId) return 0;
  try {
    const [result] = await pool.query(
      'DELETE FROM tool_config_value_aliases WHERE target_config_value_id=? AND config_category_id<>?',
      [targetId, categoryId]
    );
    return Number(result.affectedRows || 0);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146) return 0;
    throw error;
  }
}

module.exports = {
  normalizeAlias,
  getCategory,
  listActiveValues,
  listAliases,
  createAlias,
  deleteAlias,
  preserveRenamedValueAliases,
  deleteAliasesForMovedTarget
};
