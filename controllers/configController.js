const configModel = require('../models/configModel');

function parseIncludeInactiveFlag(value) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

async function renderConfigPage(req, res, next) {
  try {
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    const categories = await configModel.listConfigCategoriesWithValues({ includeInactiveValues });
    const categorySections = configModel.groupConfigCategories(categories);
    const summary = await configModel.getConfigSummary();

    res.render('pages/management-config', {
      pageTitle: 'Config Values',
      currentNav: 'management-config',
      categories,
      categorySections,
      summary,
      includeInactiveValues
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderConfigPage
};