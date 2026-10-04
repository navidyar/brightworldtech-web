'use strict';

const argon2 = require('argon2');
const authModel = require('../models/authModel');
const apiAuthModel = require('../models/apiAuthModel');
const { resolveToolSource } = require('../services/apiToolCredential');
const {
  createApiToken,
  hashApiToken,
  getApiSessionExpiry
} = require('../services/apiToken');

function sendApiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function serializeUser(user) {
  return {
    user_id: Number(user.user_id),
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    roles: Array.isArray(user.roles) ? user.roles : []
  };
}

async function login(req, res, next) {
  try {
    const toolSource = resolveToolSource(req.get('x-bwt-tool-key'));
    if (!toolSource) {
      return sendApiError(res, 401, 'INVALID_TOOL_CREDENTIAL', 'The tool credential is invalid.');
    }

    const identifier = authModel.normalizeLoginIdentifier(req.body?.identifier || req.body?.email);
    const password = String(req.body?.password || '');
    const pin = String(req.body?.pin || '').trim();
    const usingPin = Boolean(pin);
    if (!identifier || (!password && !pin) || (password && pin)) {
      return sendApiError(res, 400, 'INVALID_REQUEST', 'Username/email and exactly one Tool credential (password or 6-digit PIN) are required.');
    }
    if (usingPin && !/^\d{6}$/.test(pin)) {
      return sendApiError(res, 401, 'INVALID_USER_CREDENTIALS', 'Invalid username, email, or Tool credential.');
    }

    const authUser = await authModel.getUserByLoginIdentifier(identifier);
    if (!authUser || !authUser.is_active || authUser.account_status_code !== 'active') {
      return sendApiError(res, 401, 'INVALID_USER_CREDENTIALS', 'Invalid username, email, or Tool credential.');
    }

    if (usingPin) {
      if (!authUser.tool_pin_hash) {
        return sendApiError(res, 401, 'INVALID_USER_CREDENTIALS', 'Invalid username, email, or Tool credential.');
      }
      if (authUser.tool_pin_locked_until && new Date(authUser.tool_pin_locked_until).getTime() > Date.now()) {
        return sendApiError(res, 429, 'TOOL_PIN_LOCKED', 'Tool PIN sign-in is temporarily locked after repeated failed attempts. Try again later or use the account password.');
      }
      const pinIsValid = await argon2.verify(authUser.tool_pin_hash, pin);
      if (!pinIsValid) {
        await authModel.recordFailedToolPin(authUser.user_id);
        return sendApiError(res, 401, 'INVALID_USER_CREDENTIALS', 'Invalid username, email, or Tool credential.');
      }
      await authModel.resetToolPinFailures(authUser.user_id);
    } else {
      if (!authUser.password_hash || !await argon2.verify(authUser.password_hash, password)) {
        return sendApiError(res, 401, 'INVALID_USER_CREDENTIALS', 'Invalid username, email, or Tool credential.');
      }
    }

    const user = await authModel.getUserByIdWithRoles(authUser.user_id);
    if (!user || !user.is_active || user.account_status_code !== 'active') {
      return sendApiError(res, 401, 'INVALID_USER_CREDENTIALS', 'Invalid username, email, or password.');
    }

    const rawToken = createApiToken();
    const expiresAt = getApiSessionExpiry();
    await apiAuthModel.createApiSession({
      userId: user.user_id,
      toolSource,
      tokenHash: hashApiToken(rawToken),
      expiresAt
    });

    return res.status(200).json({
      access_token: rawToken,
      token_type: 'Bearer',
      expires_at: expiresAt.toISOString(),
      tool: { source: toolSource },
      user: serializeUser(user)
    });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  return res.status(200).json({
    tool: { source: req.apiToolSource },
    user: serializeUser(req.apiUser),
    session: {
      expires_at: new Date(req.apiSession.expires_at).toISOString()
    }
  });
}

async function logout(req, res, next) {
  try {
    await apiAuthModel.revokeApiSession(req.apiSession.api_tool_session_id);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  me,
  logout
};
