'use strict';

function readBearerToken(req) {
  const authorization = String(req.get('authorization') || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = {
  readBearerToken
};
