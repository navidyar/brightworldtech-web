'use strict';

const authModel = require('../models/authModel');
const apiAuthModel = require('../models/apiAuthModel');
const { hashApiToken } = require('../services/apiToken');
const { readBearerToken } = require('../services/apiAuthorization');

function sendApiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

async function requireApiAuth(req, res, next) {
  try {
    const rawToken = readBearerToken(req);
    if (!rawToken) {
      return sendApiError(res, 401, 'AUTH_REQUIRED', 'A valid API session token is required.');
    }

    const session = await apiAuthModel.getActiveApiSessionByTokenHash(hashApiToken(rawToken));
    if (!session) {
      return sendApiError(res, 401, 'INVALID_API_SESSION', 'The API session is invalid or expired.');
    }

    const user = await authModel.getUserByIdWithRoles(session.user_id);
    if (!user || !user.is_active || user.account_status_code !== 'active') {
      await apiAuthModel.revokeApiSession(session.api_tool_session_id);
      return sendApiError(res, 401, 'INVALID_API_SESSION', 'The API session is invalid or expired.');
    }

    req.apiSession = session;
    req.apiUser = user;
    req.apiToolSource = session.tool_source;
    await apiAuthModel.touchApiSession(session.api_tool_session_id);

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireApiAuth
};
