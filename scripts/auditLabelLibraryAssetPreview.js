'use strict';

require('dotenv').config();
const fs = require('node:fs');
const { pool } = require('../models/db');
const { resolveAssetAbsolutePath } = require('../services/labelAssetStorage');

const IMAGE_KINDS = new Set(['logo', 'image', 'background']);

async function main() {
  const [assets] = await pool.query(`
    SELECT asset_id, asset_kind, mime_type, storage_relative_path
    FROM label_assets
    ORDER BY asset_id
  `);

  let visualAssets = 0;
  let jsonAssets = 0;
  let fallbackAssets = 0;
  let missingFiles = 0;

  for (const asset of assets) {
    const kind = String(asset.asset_kind || '');
    const mime = String(asset.mime_type || '');
    if (IMAGE_KINDS.has(kind) && mime.startsWith('image/')) visualAssets += 1;
    else if (mime === 'application/json' || kind.endsWith('_json')) jsonAssets += 1;
    else fallbackAssets += 1;

    try {
      const absolutePath = resolveAssetAbsolutePath(asset.storage_relative_path);
      if (!fs.existsSync(absolutePath)) missingFiles += 1;
    } catch (error) {
      missingFiles += 1;
    }
  }

  console.log('\nLabel Library asset preview audit (read-only)');
  console.log(`Shared assets: ${assets.length}`);
  console.log(`Visual-image previews: ${visualAssets}`);
  console.log(`JSON/text previews: ${jsonAssets}`);
  console.log(`Metadata-only fallback assets: ${fallbackAssets}`);
  console.log(`Missing asset files: ${missingFiles}`);
  console.log('Asset preview is presentation-only; template layout/configuration and activation rules are unchanged.');

  if (missingFiles !== 0) {
    throw new Error('Label Library asset preview audit found missing asset files.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
