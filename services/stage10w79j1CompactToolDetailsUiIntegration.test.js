'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Tool Details uses the established Unit Details section/grid styling without a new visual system', () => {
  const markup = read('views/fragments/tech-unit-tool-details.ejs');
  assert.match(markup, /class="tech-detail-section tech-tool-observed-details"/);
  assert.match(markup, /class="tech-detail-section-heading"/);
  assert.match(markup, /class="tech-detail-grid"/);
  assert.doesNotMatch(markup, /<style|tech-tool-card|tool-details-panel/);
});

test('unknown tool values are omitted instead of rendering a wall of Unknown labels', () => {
  const markup = read('views/fragments/tech-unit-tool-details.ejs');
  assert.match(markup, /\['unknown', 'unavailable', 'not_available', 'not available'\]/);
  assert.match(markup, /if \(hasToolData\)/);
  assert.doesNotMatch(markup, />Unknown</);
  assert.doesNotMatch(markup, /No tool-observed details have been recorded/);
});

test('normal Storage and Graphics remain in their established Unit Details sections instead of being duplicated as tool-observed summaries', () => {
  const markup = read('views/fragments/tech-unit-tool-details.ejs');
  assert.doesNotMatch(markup, /Tool-Observed Storage/);
  assert.doesNotMatch(markup, /details\.storage/);
  assert.doesNotMatch(markup, /details\.graphics/);
  assert.doesNotMatch(markup, /drive\.size_gb/);
});

test('related tool observations are compacted into readable Wi-Fi LTE TPM battery and adapter rows', () => {
  const markup = read('views/fragments/tech-unit-tool-details.ejs');
  for (const label of ['Wi-Fi Hardware', 'LTE / WWAN', 'TPM', 'Battery Hardware', 'BIOS Adapter Warning']) {
    assert.match(markup, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(markup, /<span>TPM Version<\/span>/);
  assert.doesNotMatch(markup, /<span>LTE Technology<\/span>/);
  assert.doesNotMatch(markup, /<span>Adapter Warning Message<\/span>/);
});

test('wipe evidence and recent tool runs remain available only when records exist', () => {
  const markup = read('views/fragments/tech-unit-tool-details.ejs');
  assert.match(markup, /if \(wipeRows\.length > 0\)/);
  assert.match(markup, /Secure-Wipe Evidence/);
  assert.match(markup, /if \(runRows\.length > 0\)/);
  assert.match(markup, /Recent Tool Runs/);
});
test('lazy Tool Details leaves the orange header and relocates after the established detail sections', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(table, /hx-on::after-swap=/);
  assert.match(table, /querySelectorAll\('\.tech-detail-section:not\(\.tech-tool-observed-details\)'\)/);
  assert.match(table, /insertAdjacentElement\('afterend', this\)/);
  assert.doesNotMatch(table, /class="tech-tool-details-slot"[\s\S]{0,300}style="flex: 1 0 100%/);
});

