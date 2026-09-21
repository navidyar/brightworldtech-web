'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('owned solo printer is preferred when the user has not explicitly selected another destination', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /function selectPreferredPrintDestination/);
  assert.match(controller, /printer\.scopeCode === 'solo'/);
  assert.match(controller, /Number\(printer\.ownerUserId\) === userId/);
  assert.match(controller, /return ownedSolo\?\.id \|\| options\[0\]\?\.id \|\| ''/);
  assert.equal((controller.match(/selectPreferredPrintDestination\(printers, printerId, currentUser\)/g) || []).length, 2);
});

test('label and destructive Unit modals reuse the clean Unit modal shell without sticky headers', () => {
  const printModal = read('views/fragments/tech-unit-print-label-modal.ejs');
  const bulkModal = read('views/fragments/tech-units-bulk-print-label-modal.ejs');
  const recentModal = read('views/fragments/tech-recent-prints-modal.ejs');
  const deleteModal = read('views/fragments/tech-unit-permanent-delete-modal.ejs');
  const sharedCss = read('public/css/work-area.css');
  const techCss = read('public/css/tech.css');

  for (const modal of [printModal, bulkModal, recentModal, deleteModal]) {
    assert.match(modal, /modal-panel site-clean-modal/);
  }
  assert.match(sharedCss, /\.modal-panel\.site-clean-modal \.modal-header \{[\s\S]*?position: static;/);
  assert.doesNotMatch(printModal, /class="eyebrow"/);
  assert.doesNotMatch(deleteModal, /class="eyebrow"/);
  assert.match(techCss, /\.tech-permanent-delete-card \{[\s\S]*?border-radius: 7px;[\s\S]*?background: #ffffff;/);
});
