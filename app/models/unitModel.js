const pool = require('../db/pool');

function getOrderByClause(sort = '') {
  const sortMap = {
    newest: 'ORDER BY created_at DESC, id DESC',
    oldest: 'ORDER BY created_at ASC, id ASC',
    name_asc: 'ORDER BY name ASC, id ASC',
    name_desc: 'ORDER BY name DESC, id DESC',
    price_asc: 'ORDER BY price ASC, id ASC',
    price_desc: 'ORDER BY price DESC, id DESC',
    quantity_asc: 'ORDER BY quantity ASC, id ASC',
    quantity_desc: 'ORDER BY quantity DESC, id DESC'
  };

  return sortMap[sort] || sortMap.newest;
}

function normalizePageSize(pageSize) {
  const allowed = [5, 10, 25, 50];
  return allowed.includes(pageSize) ? pageSize : 5;
}

function buildUnitsWhereClause(search = '', category = '') {
  const conditions = [];
  const params = [];

  if (search) {
    const likeValue = `%${search}%`;
    conditions.push('(name LIKE ? OR category LIKE ?)');
    params.push(likeValue, likeValue);
  }

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

async function getAllUnits(search = '', sort = 'newest', category = '') {
  const { whereSql, params } = buildUnitsWhereClause(search, category);

  const sql = `
    SELECT
      id,
      name,
      category,
      quantity,
      price,
      created_at,
      updated_at
    FROM items
    ${whereSql}
    ${getOrderByClause(sort)}
  `;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getUnitsPage(search = '', sort = 'newest', page = 1, pageSize = 5, category = '') {
  const safePageSize = normalizePageSize(
    Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 5
  );

  const { whereSql, params } = buildUnitsWhereClause(search, category);

  const countSql = `
    SELECT COUNT(*) AS total_count
    FROM items
    ${whereSql}
  `;

  const [countRows] = await pool.execute(countSql, params);
  const totalCount = Number(countRows[0].total_count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));

  let safePage = Number.isInteger(page) && page > 0 ? page : 1;
  if (safePage > totalPages) {
    safePage = totalPages;
  }

  const offset = (safePage - 1) * safePageSize;

  const dataSql = `
    SELECT
      id,
      name,
      category,
      quantity,
      price,
      created_at,
      updated_at
    FROM items
    ${whereSql}
    ${getOrderByClause(sort)}
    LIMIT ${safePageSize}
    OFFSET ${offset}
  `;

  const [rows] = await pool.execute(dataSql, params);

  return {
    rows,
    totalCount,
    page: safePage,
    pageSize: safePageSize,
    totalPages
  };
}

async function getUnitById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      name,
      category,
      quantity,
      price,
      created_at,
      updated_at
    FROM items
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

async function getDistinctCategories() {
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT category
    FROM items
    WHERE category IS NOT NULL AND category <> ''
    ORDER BY category ASC
    `
  );

  return rows.map((row) => row.category);
}

async function createUnit({ name, category, quantity, price }) {
  const [result] = await pool.execute(
    `
    INSERT INTO items (name, category, quantity, price)
    VALUES (?, ?, ?, ?)
    `,
    [name, category, quantity, price]
  );

  return result;
}

async function updateUnit(id, { name, category, quantity, price }) {
  const [result] = await pool.execute(
    `
    UPDATE items
    SET name = ?, category = ?, quantity = ?, price = ?
    WHERE id = ?
    `,
    [name, category, quantity, price, id]
  );

  return result;
}

async function deleteUnit(id) {
  const [result] = await pool.execute(
    `
    DELETE FROM items
    WHERE id = ?
    `,
    [id]
  );

  return result;
}

async function getDashboardStats() {
  const [rows] = await pool.execute(
    `
    SELECT
      COUNT(*) AS total_items,
      COALESCE(SUM(quantity), 0) AS total_quantity,
      COUNT(DISTINCT category) AS total_categories
    FROM items
    `
  );

  return rows[0];
}

async function getRecentItems(limit = 5) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      name,
      category,
      quantity,
      price,
      created_at
    FROM items
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit}
    `
  );

  return rows;
}

async function getCategorySummary() {
  const [rows] = await pool.execute(
    `
    SELECT
      category,
      COUNT(*) AS item_count,
      COALESCE(SUM(quantity), 0) AS total_quantity
    FROM items
    GROUP BY category
    ORDER BY category ASC
    `
  );

  return rows;
}

module.exports = {
  getAllUnits,
  getUnitsPage,
  getUnitById,
  getDashboardStats,
  getRecentItems,
  getCategorySummary,
  getDistinctCategories,
  createUnit,
  updateUnit,
  deleteUnit
};