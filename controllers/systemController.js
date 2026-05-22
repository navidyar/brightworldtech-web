const systemModel = require('../models/systemModel');

async function renderHomePage(req, res, next) {
  try {
    const status = await systemModel.getFoundationStatus();

    res.render('pages/home', {
      pageTitle: 'Foundation Check',
      status
    });
  } catch (error) {
    next(error);
  }
}

async function renderDatabasePage(req, res, next) {
  try {
    const status = await systemModel.getFoundationStatus();

    res.render('pages/database-check', {
      pageTitle: 'Database Check',
      status
    });
  } catch (error) {
    next(error);
  }
}

async function getHealth(req, res) {
  const status = await systemModel.getFoundationStatus();

  res.status(status.database.connected ? 200 : 503).json({
    app: 'ok',
    database: status.database.connected ? 'connected' : 'disconnected',
    schema: status.schema.ok ? 'ready' : 'incomplete',
    dbName: status.database.connectionInfo?.database_name || process.env.DB_NAME || null,
    missingTables: status.schema.missingTables
  });
}

module.exports = {
  renderHomePage,
  renderDatabasePage,
  getHealth
};