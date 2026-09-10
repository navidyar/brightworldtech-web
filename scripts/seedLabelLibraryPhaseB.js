'use strict';

const crypto = require('node:crypto');
const { pool } = require('../models/db');
const { writeContentAddressedAsset } = require('../services/labelAssetStorage');
const { INITIAL_STANDARD_LABEL_TEMPLATE } = require('../config/labelLibrary');
const { buildUnitLabelPreviewDataUri } = require('../services/labelPrintingService');

const applyMode = process.argv.includes('--apply');

const INITIAL_LAYOUT = Object.freeze({
  schemaVersion: 1,
  legacyRendererId: 'standard-unit-62',
  backgroundAssetKey: null,
  elements: Object.freeze([
    Object.freeze({ id: 'brand', type: 'static_text', x: 34, y: 8, width: 652, height: 30, text: 'BWT DALLAS', style: { fontFamily: 'DejaVu Sans', fontSize: 24, fontWeight: 700, align: 'center' } }),
    Object.freeze({ id: 'primary', type: 'dynamic_text', x: 34, y: 42, width: 652, height: 52, source: { field: 'unit.primary_label', format: 'plain' }, style: { fontFamily: 'DejaVu Sans', fontSize: 48, fontWeight: 700, align: 'center', overflow: 'shrink' } }),
    Object.freeze({ id: 'model', type: 'dynamic_text', x: 34, y: 100, width: 652, height: 34, source: { field: 'unit.model_display', format: 'plain' }, style: { fontFamily: 'DejaVu Sans', fontSize: 28, fontWeight: 700, align: 'left', overflow: 'shrink' } }),
    Object.freeze({ id: 'serial', type: 'composed_text', x: 34, y: 136, width: 652, height: 30, parts: [{ type: 'static', value: 'SN: ' }, { type: 'field', field: 'unit.primary_serial', format: 'plain', fallback: '-' }], style: { fontFamily: 'DejaVu Sans', fontSize: 24, fontWeight: 500, align: 'left', overflow: 'shrink' } }),
    Object.freeze({ id: 'specs', type: 'dynamic_text', x: 34, y: 166, width: 652, height: 28, source: { field: 'unit.spec_line', format: 'plain' }, style: { fontFamily: 'DejaVu Sans', fontSize: 21, fontWeight: 500, align: 'left', overflow: 'shrink' } }),
    Object.freeze({ id: 'lot', type: 'composed_text', x: 34, y: 194, width: 652, height: 28, parts: [{ type: 'static', value: 'Lot: ' }, { type: 'field', field: 'lot.name', format: 'plain', fallback: '-' }], style: { fontFamily: 'DejaVu Sans', fontSize: 21, fontWeight: 500, align: 'left', overflow: 'shrink' } }),
    Object.freeze({ id: 'barcode', type: 'barcode', symbology: 'code39', x: 34, y: 232, width: 652, height: 72, payload: { type: 'field', field: 'unit.asset_tag' }, showText: true })
  ])
});

function buildConfigBuffer() {
  return Buffer.from(`${JSON.stringify(INITIAL_LAYOUT, null, 2)}\n`, 'utf8');
}

async function inspect() {
  const configBuffer = buildConfigBuffer();
  const sha256 = crypto.createHash('sha256').update(configBuffer).digest('hex');

  const previewDataUri = await buildUnitLabelPreviewDataUri(
    {
      unitId: 42,
      assetTag: 'BWT1234567',
      manufacturerName: 'Dell',
      modelName: 'Latitude 5420',
      unitSerialNumber: 'ABC123',
      biosSerialNumber: 'BIOS123',
      ramGb: 16,
      storageGb: 512,
      lotName: 'Production Lot'
    },
    { lot_name: 'Production Lot' }
  );
  const previewPrefix = 'data:image/png;base64,';
  if (!previewDataUri.startsWith(previewPrefix)) {
    throw new Error('The current standard-unit-62 preview renderer did not return a PNG data URI.');
  }
  const previewBuffer = Buffer.from(previewDataUri.slice(previewPrefix.length), 'base64');
  const previewSha256 = crypto.createHash('sha256').update(previewBuffer).digest('hex');

  const [[asset]] = await pool.query('SELECT * FROM label_assets WHERE sha256 = ? LIMIT 1', [sha256]);
  const [[previewAsset]] = await pool.query('SELECT * FROM label_assets WHERE sha256 = ? LIMIT 1', [previewSha256]);
  const [[template]] = await pool.query(
    `SELECT template.*
     FROM label_templates template
     INNER JOIN label_template_asset_links link ON link.label_template_id = template.label_template_id
     INNER JOIN label_assets asset ON asset.asset_id = link.asset_id
     WHERE link.role = 'config_json' AND asset.sha256 = ?
     LIMIT 1`,
    [sha256]
  );
  const [[marker]] = await pool.query(
    `SELECT label_library_audit_event_id
     FROM label_library_audit_events
     WHERE event_type = 'initial_template_registered'
     ORDER BY label_library_audit_event_id
     LIMIT 1`
  );

  return { configBuffer, previewBuffer, sha256, previewSha256, asset: asset || null, previewAsset: previewAsset || null, template: template || null, marker: marker || null };
}

function printReport(label, state) {
  console.log(`\nStage 10W83 Label Library Phase B seed (${label})`);
  console.log(`Initial template: ${INITIAL_STANDARD_LABEL_TEMPLATE.name}`);
  console.log(`Config SHA-256: ${state.sha256}`);
  console.log(`Config asset: ${state.asset ? `present (asset ${state.asset.asset_id})` : 'not installed'}`);
  console.log(`Preview asset: ${state.previewAsset ? `present (asset ${state.previewAsset.asset_id})` : 'not installed'}`);
  console.log(`Initial template: ${state.template ? `present (template ${state.template.label_template_id}, ${state.template.status})` : 'not present'}`);
  console.log(`Registration marker: ${state.marker ? 'present' : 'not installed'}`);
  if (!state.marker && !state.template) console.log('Pending operation: register current standard-unit-62 design as the initial active Label Library template.');
  else if (state.marker && !state.template) console.log('Initial template was registered previously and has since been removed; it will not be recreated.');
  else console.log('Phase B initial Label Library template is already registered.');
}

async function applySeed(state) {
  if (state.marker || state.template) return;

  const stored = await writeContentAddressedAsset(state.configBuffer, { mimeType: 'application/json' });
  const storedPreview = await writeContentAddressedAsset(state.previewBuffer, { mimeType: 'image/png' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO label_assets
        (name, asset_kind, status, sha256, storage_relative_path, mime_type, byte_size,
         source_filename, created_by_user_id, updated_by_user_id)
       VALUES (?, 'config_json', 'active', ?, ?, 'application/json', ?, ?, NULL, NULL)
       ON DUPLICATE KEY UPDATE asset_id = LAST_INSERT_ID(asset_id)`,
      ['Standard Unit Label Layout', stored.sha256, stored.relativePath, stored.byteSize, 'standard-unit-62.json']
    );
    const [[assetRow]] = await connection.query('SELECT * FROM label_assets WHERE sha256 = ? LIMIT 1', [stored.sha256]);

    await connection.query(
      `INSERT INTO label_assets
        (name, asset_kind, status, sha256, storage_relative_path, mime_type, byte_size,
         width_pixels, height_pixels, has_transparency, source_filename, created_by_user_id, updated_by_user_id)
       VALUES (?, 'preview', 'active', ?, ?, 'image/png', ?, 1440, 720, 0, ?, NULL, NULL)
       ON DUPLICATE KEY UPDATE asset_id = LAST_INSERT_ID(asset_id)`,
      ['Standard Unit Label Preview', storedPreview.sha256, storedPreview.relativePath, storedPreview.byteSize, 'standard-unit-62-preview.png']
    );
    const [[previewAssetRow]] = await connection.query('SELECT * FROM label_assets WHERE sha256 = ? LIMIT 1', [storedPreview.sha256]);

    const t = INITIAL_STANDARD_LABEL_TEMPLATE;
    const [templateResult] = await connection.query(
      `INSERT INTO label_templates
        (name, description, category_code, status, printer_profile_code, media_code, dpi,
         canvas_width_dots, canvas_height_dots, printable_width_dots, horizontal_offset_dots,
         feed_margin_dots, revision, activated_at, new_until, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP(6), NULL, NULL, NULL)`,
      [t.name, t.description, t.categoryCode, t.printerProfileCode, t.mediaCode, t.dpi,
       t.canvasWidthDots, t.canvasHeightDots, t.printableWidthDots, t.horizontalOffsetDots,
       t.feedMarginDots]
    );
    const templateId = Number(templateResult.insertId);

    await connection.query(
      `INSERT INTO label_template_asset_links
        (label_template_id, asset_id, asset_key, role, sort_order, created_by_user_id, updated_by_user_id)
       VALUES
        (?, ?, 'config', 'config_json', 10, NULL, NULL),
        (?, ?, 'preview', 'preview', 20, NULL, NULL)`,
      [templateId, assetRow.asset_id, templateId, previewAssetRow.asset_id]
    );

    await connection.query(
      `INSERT INTO label_library_audit_events
        (actor_user_id, event_type, entity_type, entity_id, entity_name_snapshot, details_json)
       VALUES (NULL, 'initial_template_registered', 'label_template', ?, ?, ?)`,
      [templateId, t.name, JSON.stringify({ legacyRendererId: 'standard-unit-62', configSha256: stored.sha256, previewSha256: storedPreview.sha256 })]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  try {
    const before = await inspect();
    printReport(applyMode ? 'pre-apply' : 'dry-run', before);

    if (!applyMode) {
      console.log('\nNo database or filesystem changes were made. Re-run with --apply after reviewing this report.');
      return;
    }

    await applySeed(before);
    const after = await inspect();
    printReport('post-apply', after);
    console.log('\nStage 10W83 Label Library Phase B seed applied successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
