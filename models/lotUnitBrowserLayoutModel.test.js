'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const layoutModel = require('./lotUnitBrowserLayoutModel');

function createStatefulConnection({ lots, layouts = {} }) {
  const lotMap = new Map(Object.entries(lots).map(([lotId, value]) => [Number(lotId), { ...value, lotId: Number(lotId) }]));
  const layoutMap = new Map();
  const calls = [];
  let nextColumnId = 1;

  for (const [lotIdText, columns] of Object.entries(layouts)) {
    const lotId = Number(lotIdText);
    layoutMap.set(lotId, {
      lotId,
      createdByUserId: 1,
      updatedByUserId: 1,
      columns: columns.map((column) => ({
        columnId: nextColumnId++,
        lotId,
        columnKey: column.columnKey,
        isVisible: Boolean(column.isVisible),
        sortOrder: column.sortOrder
      }))
    });
  }

  function lineageRows(selectedLotId) {
    const rows = [];
    let current = lotMap.get(Number(selectedLotId));
    let depth = 0;
    while (current) {
      rows.push({
        lot_id: current.lotId,
        parent_lot_id: current.parentLotId ?? null,
        name: current.name,
        ancestry_depth: depth,
        cycle_detected: 0
      });
      depth += 1;
      current = current.parentLotId ? lotMap.get(Number(current.parentLotId)) : null;
    }
    return rows;
  }

  function dbRowsForLayout(layout) {
    const base = {
      lot_id: layout.lotId,
      layout_created_by_user_id: layout.createdByUserId ?? null,
      layout_updated_by_user_id: layout.updatedByUserId ?? null,
      layout_created_at: null,
      layout_updated_at: null
    };
    if (layout.columns.length === 0) {
      return [{ ...base, lot_unit_browser_column_id: null, column_key: null }];
    }
    return layout.columns
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((column) => ({
        ...base,
        lot_unit_browser_column_id: column.columnId,
        column_key: column.columnKey,
        is_visible: column.isVisible ? 1 : 0,
        sort_order: column.sortOrder,
        created_by_user_id: 1,
        updated_by_user_id: 1,
        created_at: null,
        updated_at: null
      }));
  }

  const connection = {
    calls,
    layoutMap,
    async query(sql, values = []) {
      calls.push({ sql, values });
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.includes('WITH RECURSIVE lot_ancestry')) {
        return [lineageRows(values[0])];
      }

      if (/^SELECT lot_id FROM lots WHERE lot_id = \? FOR UPDATE$/i.test(normalized)) {
        return [[...(lotMap.has(Number(values[0])) ? [{ lot_id: Number(values[0]) }] : [])]];
      }

      if (normalized.includes('FROM lot_unit_browser_layouts layout') && normalized.includes('WHERE layout.lot_id IN')) {
        const half = values.length / 2;
        const lotIds = values.slice(0, half).map(Number);
        return [lotIds.flatMap((lotId) => {
          const layout = layoutMap.get(lotId);
          return layout ? dbRowsForLayout(layout) : [];
        })];
      }

      if (normalized.includes('FROM lot_unit_browser_layouts layout') && normalized.includes('WHERE layout.lot_id = ?')) {
        const layout = layoutMap.get(Number(values[0]));
        return [layout ? dbRowsForLayout(layout) : []];
      }

      if (normalized.startsWith('INSERT INTO lot_unit_browser_layouts')) {
        const lotId = Number(values[0]);
        const existing = layoutMap.get(lotId);
        layoutMap.set(lotId, existing || {
          lotId,
          createdByUserId: Number(values[1]),
          updatedByUserId: Number(values[2]),
          columns: []
        });
        layoutMap.get(lotId).updatedByUserId = Number(values[2]);
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('DELETE FROM lot_unit_browser_columns')) {
        const layout = layoutMap.get(Number(values[0]));
        if (layout) layout.columns = [];
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('INSERT INTO lot_unit_browser_columns')) {
        for (let index = 0; index < values.length; index += 6) {
          const lotId = Number(values[index]);
          const layout = layoutMap.get(lotId);
          layout.columns.push({
            columnId: nextColumnId++,
            lotId,
            columnKey: String(values[index + 1]),
            isVisible: Number(values[index + 2]) === 1,
            sortOrder: Number(values[index + 3])
          });
        }
        return [{ affectedRows: values.length / 6 }];
      }

      if (normalized.startsWith('DELETE FROM lot_unit_browser_layouts')) {
        const deleted = layoutMap.delete(Number(values[0]));
        return [{ affectedRows: deleted ? 1 : 0 }];
      }

      throw new Error(`Unexpected query: ${normalized}`);
    }
  };

  return connection;
}

test('customization creates a direct layout and reset resumes nearest-parent inheritance', async () => {
  const connection = createStatefulConnection({
    lots: {
      10: { name: 'Root', parentLotId: null },
      20: { name: 'Child', parentLotId: 10 }
    },
    layouts: {
      10: [
        { columnKey: 'grade_pass_fail', isVisible: true, sortOrder: 10 },
        { columnKey: 'qc', isVisible: false, sortOrder: 20 },
        { columnKey: 'amazon_ids', isVisible: false, sortOrder: 30 },
        { columnKey: 'amazon_logistics', isVisible: false, sortOrder: 40 },
        { columnKey: 'comments', isVisible: false, sortOrder: 50 }
      ]
    }
  });

  const customized = await layoutModel.replaceLayoutForLot(20, [
    { columnKey: 'amazon_ids', isVisible: true, sortOrder: 10 },
    { columnKey: 'qc', isVisible: true, sortOrder: 20 },
    { columnKey: 'grade_pass_fail', isVisible: false, sortOrder: 30 },
    { columnKey: 'amazon_logistics', isVisible: false, sortOrder: 40 },
    { columnKey: 'comments', isVisible: false, sortOrder: 50 }
  ], 7, connection);

  assert.equal(customized.hasDirectCustomization, true);
  assert.equal(customized.source.lotId, 20);
  assert.equal(customized.columns[0].key, 'amazon_ids');
  assert.equal(customized.columns[0].isVisible, true);

  const reset = await layoutModel.resetLayoutForLot(20, connection);
  assert.equal(reset.hasDirectCustomization, false);
  assert.equal(reset.source.lotId, 10);
  assert.equal(reset.columns.find((column) => column.key === 'qc').isVisible, false);
});

test('Preserve Source Lot Behavior materializes the source effective layout inside the duplicate transaction', async () => {
  const connection = createStatefulConnection({
    lots: {
      10: { name: 'Source Root', parentLotId: null },
      20: { name: 'Source Child', parentLotId: 10 },
      40: { name: 'Target Root', parentLotId: null },
      30: { name: 'Duplicate', parentLotId: 40 }
    },
    layouts: {
      10: [
        { columnKey: 'amazon_ids', isVisible: true, sortOrder: 10 },
        { columnKey: 'grade_pass_fail', isVisible: true, sortOrder: 20 },
        { columnKey: 'qc', isVisible: false, sortOrder: 30 },
        { columnKey: 'amazon_logistics', isVisible: false, sortOrder: 40 },
        { columnKey: 'comments', isVisible: false, sortOrder: 50 }
      ],
      40: [
        { columnKey: 'qc', isVisible: true, sortOrder: 10 },
        { columnKey: 'grade_pass_fail', isVisible: true, sortOrder: 20 },
        { columnKey: 'amazon_ids', isVisible: false, sortOrder: 30 },
        { columnKey: 'amazon_logistics', isVisible: false, sortOrder: 40 },
        { columnKey: 'comments', isVisible: false, sortOrder: 50 }
      ]
    }
  });

  const result = await layoutModel.copyLayoutForDuplicate({
    sourceLotId: 20,
    targetLotId: 30,
    inheritanceMode: 'preserve_source',
    currentUserId: 7,
    connection
  });

  assert.equal(result.sourceHadDirectLayout, false);
  assert.equal(result.targetHasDirectLayout, true);
  assert.equal(result.materializedEffectiveLayout, true);

  const target = await layoutModel.getEffectiveLayoutForLot(30, connection);
  assert.equal(target.source.lotId, 30);
  assert.equal(target.columns[0].key, 'amazon_ids');
  assert.equal(target.columns[0].isVisible, true);
  assert.equal(target.columns.find((column) => column.key === 'qc').isVisible, false);
});

test('Use New Parent Inheritance leaves the duplicate uncustomized when the source has no direct Browser layout', async () => {
  const connection = createStatefulConnection({
    lots: {
      10: { name: 'Source Root', parentLotId: null },
      20: { name: 'Source Child', parentLotId: 10 },
      40: { name: 'Target Root', parentLotId: null },
      30: { name: 'Duplicate', parentLotId: 40 }
    },
    layouts: {
      10: [{ columnKey: 'amazon_ids', isVisible: true, sortOrder: 10 }],
      40: [{ columnKey: 'qc', isVisible: true, sortOrder: 10 }]
    }
  });

  const result = await layoutModel.copyLayoutForDuplicate({
    sourceLotId: 20,
    targetLotId: 30,
    inheritanceMode: 'new_parent',
    currentUserId: 7,
    connection
  });

  assert.equal(result.sourceHadDirectLayout, false);
  assert.equal(result.targetHasDirectLayout, false);
  const target = await layoutModel.getEffectiveLayoutForLot(30, connection);
  assert.equal(target.source.lotId, 40);
});
