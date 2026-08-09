'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function functionBody(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}(`);
  const end = source.indexOf(`function ${nextFunctionName}(`, start + 1);

  assert.notEqual(start, -1, `${functionName} must exist`);
  assert.notEqual(end, -1, `${nextFunctionName} must follow ${functionName}`);
  return source.slice(start, end);
}

function buildGuardHarness() {
  const source = read('public/js/tech-unit-form.js');
  const body = functionBody(source, 'handleSerialScannerEnter', 'clearDuplicateCheck');
  const calls = {
    normalized: [],
  };
  const guard = new Function(
    'getFormFromElement',
    'normalizeSerialInput',
    `${body}; return handleSerialScannerEnter;`,
  )(
    (input) => input.form || null,
    (input) => {
      calls.normalized.push(input.name);
      input.value = String(input.value || '').toUpperCase();
      return input.value.trim();
    },
  );

  return { guard, calls };
}

function createSerialForm() {
  const bios = {
    name: 'biosSerialNumber',
    value: '',
    disabled: false,
    focused: 0,
    blurred: 0,
    closest(selector) {
      if (selector === '[data-serial-enter-no-submit]') return this;
      if (selector === '[hidden]') return null;
      return null;
    },
    focus() { this.focused += 1; },
    blur() { this.blurred += 1; },
  };
  const unit = {
    name: 'unitSerialNumber',
    value: 'abc123',
    disabled: false,
    focused: 0,
    blurred: 0,
    closest(selector) {
      if (selector === '[data-serial-enter-no-submit]') return this;
      if (selector === '[hidden]') return null;
      return null;
    },
    focus() { this.focused += 1; },
    blur() { this.blurred += 1; },
  };
  const form = {
    querySelector(selector) {
      return selector === '[name="biosSerialNumber"][data-serial-enter-no-submit]' ? bios : null;
    },
  };
  unit.form = form;
  bios.form = form;

  return { form, unit, bios };
}

function createKeyEvent(target, key = 'Enter') {
  return {
    key,
    target,
    isComposing: false,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}

test('only Unit Serial and BIOS Serial carry the no-submit scanner marker', () => {
  const template = read('views/fragments/tech-unit-form.ejs');
  const markedInputs = template.match(/data-serial-enter-no-submit/g) || [];

  assert.equal(markedInputs.length, 2);
  assert.match(template, /name="unitSerialNumber"[\s\S]*?data-duplicate-check-serial[\s\S]*?data-serial-enter-no-submit/);
  assert.match(template, /name="biosSerialNumber"[\s\S]*?data-duplicate-check-serial[\s\S]*?data-serial-enter-no-submit/);
});

test('scanner Enter in Unit Serial is prevented and advances to BIOS Serial', () => {
  const { guard, calls } = buildGuardHarness();
  const { unit, bios } = createSerialForm();
  const event = createKeyEvent(unit);

  assert.equal(guard(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(unit.value, 'ABC123');
  assert.deepEqual(calls.normalized, ['unitSerialNumber']);
  assert.equal(unit.blurred, 0);
  assert.equal(bios.focused, 1);
});

test('scanner Enter in BIOS Serial is prevented and blurs for the existing duplicate check', () => {
  const { guard, calls } = buildGuardHarness();
  const { bios } = createSerialForm();
  bios.value = 'bios-456';
  const event = createKeyEvent(bios);

  assert.equal(guard(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(bios.value, 'BIOS-456');
  assert.deepEqual(calls.normalized, ['biosSerialNumber']);
  assert.equal(bios.blurred, 1);
});

test('non-Enter keys and unrelated fields retain normal form behavior', () => {
  const { guard, calls } = buildGuardHarness();
  const { unit } = createSerialForm();
  const tabEvent = createKeyEvent(unit, 'Tab');
  const unrelated = {
    name: 'manufacturerId',
    disabled: false,
    closest() { return null; },
  };
  const unrelatedEnter = createKeyEvent(unrelated);

  assert.equal(guard(tabEvent), false);
  assert.equal(tabEvent.defaultPrevented, false);
  assert.equal(guard(unrelatedEnter), false);
  assert.equal(unrelatedEnter.defaultPrevented, false);
  assert.deepEqual(calls.normalized, []);
});

test('the scanner guard runs in capture phase before implicit browser submission', () => {
  const script = read('public/js/tech-unit-form.js');

  assert.match(script, /document\.addEventListener\('keydown', handleSerialScannerEnter, true\);/);
  assert.match(script, /event\.preventDefault\(\);[\s\S]*?normalizeSerialInput\(serialInput\);/);
});

test('all Add/Edit Unit entry points load a cache-busted form script containing the scanner guard', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ]) {
    assert.match(read(relativePath), /\/js\/tech-unit-form\.js\?v=[^"']+/);
  }

  assert.match(read('public/js/tech-unit-form.js'), /handleSerialScannerEnter/);
});
