const applicationSettingsModel = require('../models/applicationSettingsModel');
const { normalizeTimeZone } = require('../utils/timeZone');
const { createDateTimeHelpers } = require('../views/partials/helpers');

const BROWSER_TIME_ZONE_COOKIE = 'bwtdallas.timezone';

function readCookie(req, name) {
  const header = String(req.headers?.cookie || '');
  const prefix = `${name}=`;
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) return null;

  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch (error) {
    return null;
  }
}

async function loadTimeZoneContext(req, res, next) {
  try {
    const settings = await applicationSettingsModel.getApplicationSettings();
    const applicationDefaultTimeZone = settings.defaultTimeZone;
    const browserTimeZone = normalizeTimeZone(readCookie(req, BROWSER_TIME_ZONE_COOKIE), null);
    const effectiveTimeZone = browserTimeZone || applicationDefaultTimeZone;

    req.timeZone = effectiveTimeZone;
    req.browserTimeZone = browserTimeZone;
    req.applicationDefaultTimeZone = applicationDefaultTimeZone;

    res.locals.timeZone = effectiveTimeZone;
    res.locals.browserTimeZone = browserTimeZone;
    res.locals.applicationDefaultTimeZone = applicationDefaultTimeZone;
    Object.assign(res.locals, createDateTimeHelpers(effectiveTimeZone));

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  BROWSER_TIME_ZONE_COOKIE,
  loadTimeZoneContext,
  readCookie
};
