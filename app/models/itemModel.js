const pool = require('../db/itemPool');


// Helper function to get ORDER BY clause based on sort parameter
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


// Helper function to build WHERE clause for search
function buildItemsWhereClause(search = '') {
  if (!search) {
    return {
      whereSql: '',
      params: []
    };
  }

  const likeValue = `%${search}%`;

  return {
    whereSql: 'WHERE name LIKE ? OR category LIKE ?',
    params: [likeValue, likeValue]
  };
}


// Function to get all items with optional search and sorting
async function getAllItems(search = '', sort = 'newest') {
  const { whereSql, params } = buildItemsWhereClause(search);

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


// Function to get paginated items with search and sorting
async function getItemsPage(search = '', sort = 'newest', page = 1, pageSize = 5) {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 5;

  const { whereSql, params } = buildItemsWhereClause(search);

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


// Function to get a single item by ID
async function getItemById(id) {
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

// Additional functions for dashboard stats and summaries
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


// Function to get recent items for dashboard
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


// Function to get category summary for dashboard
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


// Function to create a new item
async function createItem({ name, category, quantity, price }) {
  const [result] = await pool.execute(
    `
    INSERT INTO items (name, category, quantity, price)
    VALUES (?, ?, ?, ?)
    `,
    [name, category, quantity, price]
  );

  return result;
}


// Function to update an existing item
async function updateItem(id, { name, category, quantity, price }) {
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


// Function to delete an existing item
async function deleteItem(id) {
  const [result] = await pool.execute(
    `
    DELETE FROM items
    WHERE id = ?
    `,
    [id]
  );

  return result;
}

module.exports = {
  getAllItems,
  getItemsPage,
  getItemById,
  getDashboardStats,
  getRecentItems,
  getCategorySummary,
  createItem,
  updateItem,
  deleteItem
};