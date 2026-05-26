const configModel = require('../models/configModel');

async function renderConfigPage(req, res, next) {
  try {
    const categories = await configModel.listConfigCategoriesWithValues();
    const summary = await configModel.getConfigSummary();

    res.render('pages/management-config', {
      pageTitle: 'Config Values',
      currentNav: 'management-config',
      categories,
      summary
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderConfigPage
};