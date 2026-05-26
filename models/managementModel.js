const { pool } = require('./db');

async function listUsers() {
  const [rows] = await pool.query(`
    SELECT
      u.user_id,
      u.first_name,
      u.last_name,
      u.email,
      status.code AS account_status_code,
      status.label AS account_status_label,
      u.password_hash IS NOT NULL AS has_password,
      u.is_active,
      u.last_login_at,
      u.created_at,
      GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS role_codes,
      GROUP_CONCAT(r.name ORDER BY r.code SEPARATOR ', ') AS role_names
    FROM users u
    LEFT JOIN config_values status
      ON status.config_value_id = u.account_status_config_value_id
    LEFT JOIN user_roles ur
      ON ur.user_id = u.user_id
    LEFT JOIN roles r
      ON r.role_id = ur.role_id
    GROUP BY
      u.user_id,
      u.first_name,
      u.last_name,
      u.email,
      status.code,
      status.label,
      u.password_hash,
      u.is_active,
      u.last_login_at,
      u.created_at
    ORDER BY u.last_name, u.first_name, u.email
  `);

  return rows.map((row) => ({
    ...row,
    roles: row.role_codes ? row.role_codes.split(',') : []
  }));
}

async function listActiveRoles() {
  const [rows] = await pool.query(`
    SELECT
      role_id,
      code,
      name,
      description
    FROM roles
    WHERE is_active = 1
    ORDER BY
      CASE code
        WHEN 'admin' THEN 10
        WHEN 'management' THEN 20
        WHEN 'tech_lead' THEN 30
        WHEN 'tech' THEN 40
        WHEN 'qc' THEN 50
        WHEN 'packing' THEN 60
        WHEN 'warehouse' THEN 70
        WHEN 'sales' THEN 80
        ELSE 999
      END,
      name
  `);

  return rows;
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        status.code AS account_status_code,
        u.password_hash IS NOT NULL AS has_password,
        u.is_active
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

module.exports = {
  listUsers,
  listActiveRoles,
  getUserById
};