'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { isHtmxRequest } = require('../utils/htmxRequest');

function requestWithHeader(value) {
  return {
    get(name) {
      return name === 'HX-Request' ? value : undefined;
    }
  };
}

test('isHtmxRequest preserves the shared case-insensitive HTMX header behavior', () => {
  assert.equal(isHtmxRequest(requestWithHeader('true')), true);
  assert.equal(isHtmxRequest(requestWithHeader('TRUE')), true);
  assert.equal(isHtmxRequest(requestWithHeader('True')), true);
  assert.equal(isHtmxRequest(requestWithHeader('false')), false);
  assert.equal(isHtmxRequest(requestWithHeader('')), false);
  assert.equal(isHtmxRequest(requestWithHeader(undefined)), false);
});
