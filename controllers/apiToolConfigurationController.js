'use strict';

const apiToolConfiguration = require('../services/apiToolConfiguration');

async function getToolConfiguration(req, res, next) {
  try {
    return res.status(200).json(await apiToolConfiguration.getManifest());
  } catch (error) {
    return next(error);
  }
}

module.exports = { getToolConfiguration };
