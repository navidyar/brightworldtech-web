const SESSION_EXPIRES_HEADER = 'X-BWTDallas-Session-Expires-At';

function getSessionExpiryTimestamp(req) {
  const originalMaxAge = Number(req.session?.cookie?.originalMaxAge);

  if (!Number.isFinite(originalMaxAge) || originalMaxAge <= 0) {
    return null;
  }

  return Date.now() + originalMaxAge;
}

function applyAuthenticatedNavigationPolicy(req, res, next) {
  if (!req.currentUser) {
    return next();
  }

  const sessionExpiresAt = getSessionExpiryTimestamp(req);

  res.locals.sessionExpiresAt = sessionExpiresAt;
  res.set({
    'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });

  if (sessionExpiresAt) {
    res.set(SESSION_EXPIRES_HEADER, String(sessionExpiresAt));
  }

  return next();
}

module.exports = {
  SESSION_EXPIRES_HEADER,
  getSessionExpiryTimestamp,
  applyAuthenticatedNavigationPolicy
};
