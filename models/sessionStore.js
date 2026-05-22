const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');

const MySQLStore = MySQLStoreFactory(session);

function createSessionStore() {
  return new MySQLStore({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    clearExpired: true,
    checkExpirationInterval: 1000 * 60 * 15,
    expiration: 1000 * 60 * 60 * 8,

    createDatabaseTable: true,
    schema: {
      tableName: 'sessions',
      columnNames: {
        session_id: 'session_id',
        expires: 'expires',
        data: 'data'
      }
    }
  });
}

module.exports = {
  createSessionStore
};