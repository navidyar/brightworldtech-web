function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

module.exports = {
  isHtmxRequest
};
