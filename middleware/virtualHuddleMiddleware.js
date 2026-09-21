'use strict';

const virtualHuddleModel = require('../models/virtualHuddleModel');

const ALLOWED_PREFIXES = [
  '/virtual-huddle'
];

function isAllowedWhileBlocked(req) {
  const path = String(req.path || '');
  if (req.method === 'POST' && path === '/logout') return true;
  if (path === '/login') return true;
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function prefersJson(req) {
  return String(req.get('Accept') || '').includes('application/json')
    || String(req.get('Content-Type') || '').includes('application/json');
}

async function enforceVirtualHuddleAcknowledgment(req, res, next) {
  try {
    if (!req.currentUser || isAllowedWhileBlocked(req)) return next();

    const blocked = await virtualHuddleModel.hasPendingRequiredAcknowledgment(req.currentUser.user_id);
    if (!blocked) return next();

    res.set('X-BWTDallas-Virtual-Huddle-Required', '1');

    if (isHtmxRequest(req)) {
      res.set('HX-Redirect', '/virtual-huddle/required');
      return res.status(204).send('');
    }

    if (prefersJson(req)) {
      return res.status(423).json({
        error: {
          code: 'VIRTUAL_HUDDLE_ACKNOWLEDGMENT_REQUIRED',
          message: 'A Virtual Huddle requires acknowledgment before continuing.'
        }
      });
    }

    return res.redirect(303, '/virtual-huddle/required');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  enforceVirtualHuddleAcknowledgment,
  isAllowedWhileBlocked
};
