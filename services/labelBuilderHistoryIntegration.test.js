'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Builder exposes Undo and Redo controls with keyboard hints', () => {
  const view = source('views/pages/management-label-builder.ejs');
  assert.match(view, /data-builder-undo[^>]*title="Undo \(Ctrl\+Z\)"/);
  assert.match(view, /data-builder-redo[^>]*title="Redo \(Ctrl\+Y\)"/);
  assert.match(view, /data-template-revision="<%= Number\(template\.revision \|\| 0\) %>"/);
});

test('Builder history snapshots the complete persisted editor document and retains a large session history', () => {
  const js = source('public/js/label-builder.js');
  assert.match(js, /const MAX_HISTORY_STATES = 500;/);
  assert.match(js, /function buildHistorySnapshot\(\)/);
  assert.match(js, /mediaWidthCode: state\.media\.code/);
  assert.match(js, /lengthMm: state\.lengthMm/);
  assert.match(js, /layout: cloneJson\(state\.layout\)/);
  assert.match(js, /state\.history\.splice\(state\.historyIndex \+ 1\)/);
  assert.match(js, /HISTORY_INPUT_DEBOUNCE_MS = 300/);
});

test('Builder supports Ctrl+Z, Ctrl+Y, and Ctrl+Shift+Z while preserving normal canvas nudging', () => {
  const js = source('public/js/label-builder.js');
  assert.match(js, /accelerator && key === 'z'/);
  assert.match(js, /if \(event\.shiftKey\) redoHistory\(\);/);
  assert.match(js, /accelerator && key === 'y'/);
  assert.match(js, /undoButton\.addEventListener\('click', undoHistory\)/);
  assert.match(js, /redoButton\.addEventListener\('click', redoHistory\)/);
  assert.match(js, /function restoreBuilderShortcutFocus\(\)/);
  assert.match(js, /if \(active instanceof Node && root\.contains\(active\)\) return;/);
  assert.match(js, /\(selectedNode \|\| canvas\)\.focus\(\{ preventScroll: true \}\);/);
  assert.equal((js.match(/restoreBuilderShortcutFocus\(\);/g) || []).length, 2);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /commitHistoryCheckpoint\(\);\n  \}\);/);
});

test('dragging and other Builder edits create distinct checkpoints without storing every pointer move', () => {
  const js = source('public/js/label-builder.js');
  const pointerMove = js.match(/function handlePointerMove\(event\) \{[\s\S]*?\n  \}/)?.[0] || '';
  const pointerEnd = js.match(/function endPointerAction\(event\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(pointerMove, /markDirty\(\)/);
  assert.doesNotMatch(pointerMove, /commitHistoryCheckpoint\(\)/);
  assert.match(pointerEnd, /commitHistoryCheckpoint\(\)/);
  assert.match(js, /root\.addEventListener\('change'/);
  assert.match(js, /root\.addEventListener\('click'/);
});

test('save uses a submitted snapshot so edits made during a request remain unsaved locally', () => {
  const js = source('public/js/label-builder.js');
  assert.match(js, /const submittedSnapshot = buildHistorySnapshot\(\);/);
  assert.match(js, /layout: submittedSnapshot\.layout/);
  assert.match(js, /state\.savedSignature = submittedSnapshot\.signature/);
  assert.match(js, /updateDirtyIndicator\(buildHistorySnapshot\(\)\.signature\)/);
});

test('identical config saves do not increment the template revision or write another layout-saved audit event', () => {
  const model = source('models/labelLibraryModel.js');
  const start = model.indexOf('async function replaceTemplateConfigAsset');
  const end = model.indexOf('\n\n\nasync function createOrReuseLabelAsset', start);
  const body = model.slice(start, end);
  const noChange = body.indexOf("String(previous.sha256 || '').toLowerCase() === String(storedAsset.sha256 || '').toLowerCase()");
  const revision = body.indexOf('SET revision = revision + 1');
  const audit = body.indexOf("eventType: 'template_layout_saved'");
  assert.ok(noChange >= 0, 'expected identical SHA guard');
  assert.ok(revision > noChange, 'revision increment must occur after identical-state guard');
  assert.ok(audit > noChange, 'layout audit event must occur after identical-state guard');
  assert.match(body, /changed: false/);
  assert.match(body, /changed: true/);

  const controller = source('controllers/labelLibraryController.js');
  assert.match(controller, /changed: result\?\.changed !== false/);
  assert.match(source('public/js/label-builder.js'), /No layout changes · revision/);
});
