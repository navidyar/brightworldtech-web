'use strict';

require('dotenv').config();
const fs = require('node:fs');
const { pool } = require('../models/db');
const { resolveAssetAbsolutePath } = require('../services/labelAssetStorage');

async function main() {
  const [assets] = await pool.query(`
    SELECT asset_id, asset_kind, mime_type, storage_relative_path
    FROM label_assets
    WHERE asset_kind IN ('logo', 'image', 'background')
    ORDER BY asset_id
  `);

  let pngAssets = 0;
  let svgAssets = 0;
  let invalidMimeAssets = 0;
  let missingFiles = 0;

  for (const asset of assets) {
    const mime = String(asset.mime_type || '');
    if (mime === 'image/png') pngAssets += 1;
    else if (mime === 'image/svg+xml') svgAssets += 1;
    else invalidMimeAssets += 1;

    try {
      if (!fs.existsSync(resolveAssetAbsolutePath(asset.storage_relative_path))) missingFiles += 1;
    } catch (error) {
      missingFiles += 1;
    }
  }

  console.log('\nLabel Builder Shared Asset upload audit (read-only)');
  console.log(`Reusable image assets: ${assets.length}`);
  console.log(`PNG assets: ${pngAssets}`);
  console.log(`SVG assets: ${svgAssets}`);
  console.log(`Reusable image assets outside PNG/SVG: ${invalidMimeAssets}`);
  console.log(`Missing reusable asset files: ${missingFiles}`);
  console.log('Shared Assets are stored once by SHA-256 and remain reusable across Label Builder templates.');

  if (invalidMimeAssets !== 0 || missingFiles !== 0) {
    throw new Error('Shared Label Asset audit found invalid MIME types or missing files.');
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
