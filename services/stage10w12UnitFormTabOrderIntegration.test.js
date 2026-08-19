'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function buildKeyboardHarness() {
  const source = read('public/js/tech-unit-form.js');
  const start = source.indexOf('const UNIT_FORM_SEQUENTIAL_FOCUS_SELECTOR');
  const end = source.indexOf('function getLotUnitFormProfileStatus', start);

  assert.notEqual(start, -1, 'keyboard-navigation policy must exist');
  assert.notEqual(end, -1, 'keyboard-navigation policy must end before profile helpers');

  const body = source.slice(start, end);
  return new Function(
    'getFormFromElement',
    `${body}; return { removeRepeatableActionsFromTabOrder, getUnitFormSequentialFocusTargets, handleOutcomeSequentialTab };`,
  )((element) => element.form || null);
}

function createControl(id, options = {}) {
  let activeControl = null;
  const attributes = new Map(Object.entries(options.attributes || {}));
  const control = {
    id,
    disabled: Boolean(options.disabled),
    hidden: Boolean(options.hidden),
    form: null,
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    matches(selector) {
      if (selector === '[data-add-module-row], [data-remove-module-row]') {
        return Boolean(options.addAction || options.removeAction);
      }
      return false;
    },
    closest(selector) {
      if (selector === '[hidden], [aria-hidden="true"]') return null;
      return null;
    },
    getClientRects() {
      return options.visible === false ? [] : [{}];
    },
    focus() {
      activeControl = control;
      if (typeof options.onFocus === 'function') options.onFocus(control);
    },
    get activeControl() {
      return activeControl;
    },
  };

  return control;
}

function createTabHarness() {
  let active = null;
  const focusable = (id, options = {}) => createControl(id, {
    ...options,
    onFocus(control) {
      active = control;
    },
  });

  const before = focusable('before');
  const pass = focusable('pass', { attributes: { tabindex: '0' } });
  const fail = focusable('fail', { attributes: { tabindex: '0' } });
  const after = focusable('after');
  const add = focusable('add', { addAction: true, attributes: { tabindex: '-1' } });
  const remove = focusable('remove', { removeAction: true, attributes: { tabindex: '-1' } });
  const end = focusable('end');
  const controls = [before, pass, fail, after, add, remove, end];
  const form = {
    querySelectorAll(selector) {
      if (selector === '[data-outcome-tab-stop]') return [pass, fail];
      if (selector === '[data-add-module-row], [data-remove-module-row]') return [add, remove];
      return controls;
    },
  };

  controls.forEach((control) => {
    control.form = form;
  });

  function eventFor(target, { shiftKey = false } = {}) {
    return {
      key: 'Tab',
      target,
      shiftKey,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
  }

  return {
    form,
    controls: { before, pass, fail, after, add, remove, end },
    eventFor,
    getActive: () => active,
  };
}

test('all repeatable Add and Remove controls are excluded from sequential Tab navigation', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const actionTags = markup.match(/<button[^>]*(?:data-add-module-row|data-remove-module-row)[^>]*>/g) || [];

  assert.ok(actionTags.length >= 18);
  actionTags.forEach((tag) => {
    assert.match(tag, /tabindex="-1"/, `repeatable action is missing tabindex=-1: ${tag}`);
  });
});

test('Pass and Fail are marked as two explicit outcome tab stops', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const outcomeLines = markup.split('\n').filter((line) => line.includes('name="outcomeCode"'));

  assert.equal(outcomeLines.length, 1, 'the repeated EJS outcome input must appear once');
  assert.match(outcomeLines[0], /tabindex="0"/);
  assert.match(outcomeLines[0], /data-outcome-tab-stop/);
  assert.match(markup, /outcomeOptions\.forEach[\s\S]*?data-outcome-tab-stop/);
});

test('repeatable action policy is enforced again after dynamic rows are added', () => {
  const script = read('public/js/tech-unit-form.js');

  assert.match(script, /function removeRepeatableActionsFromTabOrder\(form\)/);
  assert.match(script, /form\.querySelectorAll\('\[data-add-module-row\], \[data-remove-module-row\]'\)/);
  assert.match(script, /addModuleRow\(form, rowType\);\s*removeRepeatableActionsFromTabOrder\(form\);/);
});

test('forward Tab visits Pass, then Fail, then the following field', () => {
  const { handleOutcomeSequentialTab } = buildKeyboardHarness();
  const harness = createTabHarness();
  const { before, pass, fail, after } = harness.controls;

  let event = harness.eventFor(before);
  handleOutcomeSequentialTab(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.getActive(), pass);

  event = harness.eventFor(pass);
  handleOutcomeSequentialTab(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.getActive(), fail);

  event = harness.eventFor(fail);
  handleOutcomeSequentialTab(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.getActive(), after);
});

test('reverse Tab visits Fail, then Pass, then the preceding field', () => {
  const { handleOutcomeSequentialTab } = buildKeyboardHarness();
  const harness = createTabHarness();
  const { before, pass, fail, after } = harness.controls;

  let event = harness.eventFor(after, { shiftKey: true });
  handleOutcomeSequentialTab(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.getActive(), fail);

  event = harness.eventFor(fail, { shiftKey: true });
  handleOutcomeSequentialTab(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.getActive(), pass);

  event = harness.eventFor(pass, { shiftKey: true });
  handleOutcomeSequentialTab(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.getActive(), before);
});

test('focus target calculation skips Add and Remove buttons', () => {
  const { getUnitFormSequentialFocusTargets, removeRepeatableActionsFromTabOrder } = buildKeyboardHarness();
  const harness = createTabHarness();

  removeRepeatableActionsFromTabOrder(harness.form);
  const ids = getUnitFormSequentialFocusTargets(harness.form).map((control) => control.id);

  assert.deepEqual(ids, ['before', 'pass', 'fail', 'after', 'end']);
  assert.equal(harness.controls.add.getAttribute('tabindex'), '-1');
  assert.equal(harness.controls.remove.getAttribute('tabindex'), '-1');
});

test('the outcome Tab handler runs in capture phase before native radio-group skipping', () => {
  const script = read('public/js/tech-unit-form.js');

  assert.match(script, /document\.addEventListener\('keydown', handleOutcomeSequentialTab, true\);/);
  assert.match(script, /const currentIsOutcome = outcomeRadios\.includes\(event\.target\);/);
  assert.match(script, /const nextIsOutcome = outcomeRadios\.includes\(nextTarget\);/);
});

test('all Add/Edit Unit entry points use the current Unit form asset version', () => {
  const expected = '/js/tech-unit-form.js?v=20260813-stage10w50-unit-save-preflight';

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ]) {
    assert.match(read(relativePath), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
