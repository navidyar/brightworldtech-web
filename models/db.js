const mysql = require('mysql2/promise');

const REQUIRED_ENV_KEYS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

function getMissingEnvKeys() {
  return REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
}

function getDbConfig() {
  const missingKeys = getMissingEnvKeys();

  if (missingKeys.length > 0) {
    throw new Error(`Missing required database environment values: ${missingKeys.join(', ')}`);
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: false
  };
}

const pool = mysql.createPool(getDbConfig());

async function testConnection() {
  const [rows] = await pool.query(`
    SELECT
      DATABASE() AS database_name,
      VERSION() AS mysql_version,
      NOW() AS server_time
  `);

  return rows[0];
}

module.exports = {
  pool,
  testConnection,
  getDbConfig,
  getMissingEnvKeys
};