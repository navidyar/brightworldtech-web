'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildLotHierarchyOptions,
  buildLotHierarchyLookup,
  resolveSnapshotPath,
  snapshotLotPath
} = require('./lotHierarchyPresentation');
const { buildUnitHistoryTimeline } = require('./unitHistoryTimeline');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const lots = [
  { lot_id: 1, lot_name: 'Corporate', parent_lot_id: null, is_active: 1 },
  { lot_id: 2, lot_name: 'Refurbishment', parent_lot_id: 1, is_active: 1 },
  { lot_id: 3, lot_name: 'Dell', parent_lot_id: 2, is_active: 1 },
  { lot_id: 4, lot_name: 'OptiPlex', parent_lot_id: 3, is_active: 1 },
  { lot_id: 5, lot_name: '7000 Series', parent_lot_id: 4, is_active: 1 },
  { lot_id: 6, lot_name: 'Dallas Lot 26-08', parent_lot_id: 5, is_active: 1 }
];

test('Lot hierarchy presentation supports arbitrary depth while keeping only leaf destinations selectable', () => {
  const options = buildLotHierarchyOptions(lots, [lots[5]]);
  assert.equal(options.length, 6);
  assert.deepEqual(options.map((option) => option.selectable), [false, false, false, false, false, true]);
  assert.equal(options[5].depth, 5);
  assert.equal(options[5].compactLabel, '7000 Series › Dallas Lot 26-08');
  assert.equal(options[5].fullPath, 'Corporate › Refurbishment › Dell › OptiPlex › 7000 Series › Dallas Lot 26-08');
  assert.match(options[5].searchText, /Corporate Refurbishment Dell OptiPlex 7000 Series Dallas Lot 26-08/);
});

test('inactive ancestors are not disclosed in normal selector paths', () => {
  const hiddenParentLots = lots.map((lot) => ({ ...lot }));
  hiddenParentLots[2].is_active = 0;
  const options = buildLotHierarchyOptions(hiddenParentLots, [hiddenParentLots[5]]);
  assert.equal(options.some((option) => option.lotName === 'Dell'), false);
  assert.equal(options.at(-1).fullPath, 'OptiPlex › 7000 Series › Dallas Lot 26-08');
});

test('history snapshots keep the historical ID chain while resolving current Lot names dynamically', () => {
  const oldSnapshot = snapshotLotPath(lots, 6);
  assert.deepEqual(oldSnapshot.ids, [1, 2, 3, 4, 5, 6]);

  const renamedAndReparentedCatalog = [
    { lot_id: 1, lot_name: 'Corporate HQ', parent_lot_id: null, is_active: 1 },
    { lot_id: 2, lot_name: 'Refurb Operations', parent_lot_id: 1, is_active: 1 },
    { lot_id: 3, lot_name: 'Dell Systems', parent_lot_id: 9, is_active: 1 },
    { lot_id: 4, lot_name: 'OptiPlex', parent_lot_id: 3, is_active: 1 },
    { lot_id: 5, lot_name: '7000 Series', parent_lot_id: 4, is_active: 1 },
    { lot_id: 6, lot_name: 'Dallas Lot 26-08', parent_lot_id: 5, is_active: 1 },
    { lot_id: 9, lot_name: 'Projects', parent_lot_id: 1, is_active: 1 }
  ];
  const currentNameById = new Map(renamedAndReparentedCatalog.map((lot) => [lot.lot_id, lot.lot_name]));

  assert.equal(
    resolveSnapshotPath(oldSnapshot, currentNameById),
    'Corporate HQ › Refurb Operations › Dell Systems › OptiPlex › 7000 Series › Dallas Lot 26-08'
  );

  const timeline = buildUnitHistoryTimeline({
    lotCatalog: renamedAndReparentedCatalog,
    auditEvents: [{
      eventId: 10,
      eventType: 'unit_updated',
      eventSummary: 'Moved Unit',
      actorName: 'Admin User',
      occurredAt: '2026-08-11T10:00:00Z',
      metadata: JSON.stringify({
        lotHierarchyPaths: {
          assignable_lot: {
            old: oldSnapshot,
            new: { ids: [1, 9, 3], labels: ['Corporate', 'Projects', 'Dell'] }
          }
        }
      }),
      changes: [{
        fieldKey: 'assignable_lot',
        fieldLabel: 'Lot',
        changeType: 'changed',
        oldValue: JSON.stringify(6),
        newValue: JSON.stringify(3),
        oldValueText: 'Dallas Lot 26-08',
        newValueText: 'Dell'
      }]
    }]
  });

  assert.equal(
    timeline.events[0].changes[0].oldValueText,
    'Corporate HQ › Refurb Operations › Dell Systems › OptiPlex › 7000 Series › Dallas Lot 26-08'
  );
  assert.equal(timeline.events[0].changes[0].newValueText, 'Corporate HQ › Projects › Dell Systems');
});

test('operational and Management Lot selectors expose the shared hierarchy presentation', () => {
  const techForm = read('views/fragments/tech-unit-form.ejs');
  const techPage = read('views/pages/tech-units.ejs');
  const parkModal = read('views/fragments/tech-unit-park-modal.ejs');
  const overrideModal = read('views/fragments/tech-override-request-modal.ejs');
  const overrideDetail = read('views/pages/override-request-detail.ejs');
  const dashboardFilters = read('views/fragments/dashboard-filters.ejs');
  const unitTable = read('views/fragments/tech-units-table.ejs');
  const lotNew = read('views/pages/management-lot-new.ejs');
  const lotEdit = read('views/fragments/lot-form-modal.ejs');

  assert.match(techForm, /data-lot-full-path/);
  assert.match(techForm, /data-assignable-lot-hierarchy-path/);
  assert.match(techPage, /hierarchical-lot-options/);
  assert.match(parkModal, /hierarchical-lot-options/);
  assert.match(overrideModal, /hierarchical-lot-options/);
  assert.match(overrideDetail, /hierarchical-lot-options/);
  assert.match(dashboardFilters, /hierarchical-lot-options/);
  assert.match(unitTable, /data-lot-hierarchy-help/);
  assert.match(unitTable, /Lot Hierarchy/);
  assert.match(read('views/pages/tech-unit-detail.ejs'), /tech-units\.js\?v=20260819-stage10w68l-filter-toggles/);
  assert.match(lotNew, /<select name="parentLotId" data-hierarchical-lot-select>/);
  assert.match(lotNew, /parent-lot-options/);
  assert.match(lotEdit, /<select name="parentLotId" data-hierarchical-lot-select>/);
  assert.match(lotEdit, /parent-lot-options/);
});

test('future audit events snapshot Lot hierarchy IDs into existing event metadata without a schema migration', () => {
  const auditModel = read('models/unitAuditEventModel.js');
  const lotModel = read('models/lotModel.js');
  assert.match(auditModel, /lotHierarchyPaths/);
  assert.match(auditModel, /snapshotLotPath/);
  assert.match(auditModel, /enrichLotHierarchyMetadata/);
  assert.match(lotModel, /async function listLotHierarchyRows/);
  assert.doesNotMatch(auditModel, /ALTER TABLE|CREATE TABLE/);
});

test('Lot selectors keep full ancestry for search/context but render one Lot name per hierarchy row', () => {
  const hierarchyPartial = read('views/partials/hierarchical-lot-options.ejs');
  const techForm = read('views/fragments/tech-unit-form.ejs');
  const formScript = read('public/js/tech-unit-form.js');

  assert.match(hierarchyPartial, /const optionDisplayName = optionName;/);
  assert.doesNotMatch(hierarchyPartial, /optionDisplayName = isSelectable && lotOption\.compactLabel/);
  assert.match(techForm, /data-lot-name="<%= lotOptionName %>"/);
  assert.match(techForm, /data-lot-search-text="<%= hierarchyLot\.searchText \|\| hierarchyLot\.fullPath \|\| lotOptionName %>"/);
  assert.match(techForm, /\? `\$\{selectedAssignableLot\.lot_name\} \(Closed — current lot\)`/);
  assert.match(techForm, /: selectedAssignableLot\.lot_name\)/);
  assert.match(formScript, /data-lot-search-text/);
  assert.match(formScript, /tech-assignable-lot-option--ancestor/);
  assert.match(formScript, /updateAssignableLotHierarchyBreadcrumb/);
  const lookup = buildLotHierarchyLookup(lots);
  assert.equal(lookup.get(6).compactLabel, '7000 Series › Dallas Lot 26-08');
});
