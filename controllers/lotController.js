const lotModel = require('../models/lotModel');

async function renderLotsPage(req, res, next) {
  try {
    const lots = await lotModel.listLots();
    const summary = await lotModel.getLotSummary();

    res.render('pages/management-lots', {
      pageTitle: 'Lots',
      currentNav: 'management-lots',
      lots,
      summary
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderLotsPage
};