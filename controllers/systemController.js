const systemModel = require('../models/systemModel');
const { streamApplicationLiveRefreshEvents } = require('../services/applicationLiveRefreshEvents');

async function renderDatabasePage(req, res, next) {
  try {
    const status = await systemModel.getFoundationStatus();

    res.render('pages/database-check', {
      pageTitle: 'Database Check',
      currentNav: 'admin-config-database',
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
    missingTables: status.schema.missingTables,
    missingViews: status.schema.missingViews || [],
    invalidViews: status.schema.invalidViews || []
  });
}

function streamApplicationEvents(req, res) {
  return streamApplicationLiveRefreshEvents(req, res);
}

module.exports = {
  renderDatabasePage,
  getHealth,
  streamApplicationEvents
};
