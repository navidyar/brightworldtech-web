'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateToolPin } = require('./toolPinPolicy');

function valid(pin) {
  return validateToolPin(pin, pin).length === 0;
}

test('Tool PIN policy accepts non-patterned PINs from 6 through 10 digits', () => {
  for (const pin of ['127583', '4937061', '80527493', '704928615', '5862049713']) assert.equal(valid(pin), true, pin);
});

test('Tool PIN policy rejects repeated, sequential, repeated-block, and grouped patterns', () => {
  for (const pin of ['111111', '000000', '123456', '543210', '891234', '112233', '111222', '25802580']) {
    assert.equal(valid(pin), false, pin);
  }
});

test('Tool PIN policy rejects wrong length/non-digits and mismatched confirmation', () => {
  assert.match(validateToolPin('12345', '12345').join(' '), /6 to 10 digits/);
  assert.match(validateToolPin('12345678901', '12345678901').join(' '), /6 to 10 digits/);
  assert.match(validateToolPin('12a456', '12a456').join(' '), /6 to 10 digits/);
  assert.match(validateToolPin('493706', '493705').join(' '), /confirmation does not match/);
});


test('Tool PIN policy does not generically reject repeating 2- or 3-digit blocks', () => {
  assert.equal(validateToolPin('274274', '274274').length, 0);
  assert.equal(validateToolPin('2742749', '2742749').length, 0);
});
