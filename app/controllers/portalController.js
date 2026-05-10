const portalModel = require('../models/portalModel');
const { getPortalDefinition, getPortalList } = require('../data/portalConfig');

async function renderPortalHome(req, res) {
  try {
    const summary = await portalModel.getPortalSummary();

    res.render('pages/home', {
      portals: getPortalList(),
      summary
    });
  } catch (error) {
    console.error('Error rendering portal home page:', error);
    res.status(500).render('pages/error', {
      message: 'Failed to render the portal home page.'
    });
  }
}

async function renderPortalPage(req, res) {
  try {
    const portal = getPortalDefinition(req.params.portal);

    if (!portal) {
      return res.status(404).render('pages/404');
    }

    const snapshotLoaders = {
      management: portalModel.getManagementSnapshot,
      tech: portalModel.getTechSnapshot,
      warehouse: portalModel.getWarehouseSnapshot,
      sales: portalModel.getSalesSnapshot
    };

    const snapshot = await snapshotLoaders[portal.slug]();

    res.render('pages/portal-detail', {
      portal,
      snapshot
    });
  } catch (error) {
    console.error('Error rendering portal detail page:', error);
    res.status(500).render('pages/error', {
      message: 'Failed to render the portal page.'
    });
  }
}

async function getPortalSummaryApi(req, res) {
  try {
    const summary = await portalModel.getPortalSummary();

    res.json(summary);
  } catch (error) {
    console.error('Error fetching portal summary:', error);
    res.status(500).json({
      error: 'Failed to fetch portal summary'
    });
  }
}

module.exports = {
  renderPortalHome,
  renderPortalPage,
  getPortalSummaryApi
};
