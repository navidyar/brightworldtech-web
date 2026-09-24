'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
const unitToolDetailsModel = require('../models/unitToolDetailsModel');

async function renderToolDetails(req, res, next) {
  const unitId = normalizePositiveInteger(req.params.unitId);
  if (!unitId) return res.status(400).send('<p class="muted">Invalid Unit.</p>');

  try {
    const toolDetails = await unitToolDetailsModel.getToolDetailsForUnit(unitId);
    if (!toolDetails) return res.status(404).send('<p class="muted">Unit not found.</p>');
    return res.status(200).render('fragments/tech-unit-tool-details', { toolDetails });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderToolDetails
};
