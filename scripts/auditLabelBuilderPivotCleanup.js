'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

const OBSOLETE_LINK_ROLES = ['original_sample', 'background_candidate', 'sample_analysis', 'preview'];
const OBSOLETE_ASSET_KINDS = ['analysis_json', 'original_sample', 'preview'];
const ALLOWED_ASSET_KINDS = ['logo', 'image', 'background', 'config_json'];
const IMAGE_ASSET_KINDS = ['logo', 'image', 'background'];
const SAMPLE_ASSET_KEY_PREFIX = 'sample_region_';

async function main() {
  const [[column]] = await pool.query(`
    SELECT COUNT(*) AS row_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'label_templates'
      AND COLUMN_NAME = 'imported_at'
  `);
  const [[links]] = await pool.query(`
    SELECT COUNT(*) AS row_count
    FROM label_template_asset_links
    WHERE role IN (?) OR LEFT(asset_key, ?) = ?
  `, [OBSOLETE_LINK_ROLES, SAMPLE_ASSET_KEY_PREFIX.length, SAMPLE_ASSET_KEY_PREFIX]);
  const [[assets]] = await pool.query(`
    SELECT COUNT(*) AS row_count
    FROM label_assets
    WHERE asset_kind IN (?)
  `, [OBSOLETE_ASSET_KINDS]);
  const [[unsupportedImages]] = await pool.query(`
    SELECT COUNT(*) AS row_count
    FROM label_assets
    WHERE asset_kind IN (?)
      AND mime_type NOT IN ('image/png', 'image/svg+xml')
  `, [IMAGE_ASSET_KINDS]);
  const [[unexpectedKinds]] = await pool.query(`
    SELECT COUNT(*) AS row_count
    FROM label_assets
    WHERE asset_kind NOT IN (?)
  `, [ALLOWED_ASSET_KINDS]);
  const [[invalidConfigMime]] = await pool.query(`
    SELECT COUNT(*) AS row_count
    FROM label_assets
    WHERE asset_kind = 'config_json' AND mime_type <> 'application/json'
  `);

  const importedAtColumns = Number(column?.row_count || 0);
  const obsoleteLinks = Number(links?.row_count || 0);
  const obsoleteAssets = Number(assets?.row_count || 0);
  const unsupportedImageAssets = Number(unsupportedImages?.row_count || 0);
  const unexpectedAssetKinds = Number(unexpectedKinds?.row_count || 0);
  const invalidConfigMimes = Number(invalidConfigMime?.row_count || 0);

  console.log('\nLabel Builder pivot cleanup audit (read-only)');
  console.log(`Legacy imported_at columns: ${importedAtColumns}`);
  console.log(`Obsolete sample/preview links: ${obsoleteLinks}`);
  console.log(`Obsolete sample/preview assets: ${obsoleteAssets}`);
  console.log(`Reusable image assets outside PNG/SVG: ${unsupportedImageAssets}`);
  console.log(`Unexpected asset kinds: ${unexpectedAssetKinds}`);
  console.log(`config_json assets with wrong MIME type: ${invalidConfigMimes}`);
  console.log('Persistent label state is template metadata + config_json + reusable PNG/SVG assets; rendered labels remain transient output.');

  if (importedAtColumns || obsoleteLinks || obsoleteAssets || unsupportedImageAssets || unexpectedAssetKinds || invalidConfigMimes) {
    throw new Error('Label Builder pivot cleanup audit found obsolete label-import state.');
  }
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
