const itemModel = require('../models/itemModel');

async function renderHomePage(req, res) {
  try {
    const stats = await itemModel.getDashboardStats();
    const recentItems = await itemModel.getRecentItems(5);
    const categorySummary = await itemModel.getCategorySummary();

    res.render('pages/home', {
      stats,
      recentItems,
      categorySummary
    });
  } catch (error) {
    console.error('Error rendering home page:', error);
    res.status(500).render('pages/error', {
      message: 'Failed to render the home page.'
    });
  }
}

async function renderNotFoundPage(req, res) {
  res.status(404).render('pages/404');
}

async function renderErrorPage(req, res) {
  res.status(500).render('pages/error', {
    message: 'An unexpected error occurred.'
  });
}

module.exports = {
  renderHomePage,
  renderNotFoundPage,
  renderErrorPage
};