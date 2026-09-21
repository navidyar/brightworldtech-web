'use strict';

const fs = require('node:fs');
const { pool } = require('../models/db');
const { resolveAssetAbsolutePath } = require('../services/labelAssetStorage');
const { inspectLayoutReadiness } = require('../services/labelBuilderLayoutPolicy');

async function main() {
  const [templates] = await pool.query(`
    SELECT template.label_template_id, template.name, template.status, asset.storage_relative_path
    FROM label_templates template
    LEFT JOIN label_template_asset_links link
      ON link.label_template_id = template.label_template_id AND link.role = 'config_json'
    LEFT JOIN label_assets asset ON asset.asset_id = link.asset_id
    ORDER BY template.label_template_id
  `);

  let barcodeElements = 0;
  let qrElements = 0;
  let rotatedCodes = 0;
  let fieldPayloads = 0;
  let staticPayloads = 0;
  let composedPayloads = 0;
  let invalidLayouts = 0;
  let activeUnready = 0;

  for (const template of templates) {
    if (!template.storage_relative_path) continue;
    try {
      const layout = JSON.parse(await fs.promises.readFile(resolveAssetAbsolutePath(template.storage_relative_path), 'utf8'));
      const elements = Array.isArray(layout.elements) ? layout.elements : [];
      for (const element of elements) {
        if (element?.type !== 'barcode' && element?.type !== 'qr') continue;
        if (element.type === 'barcode') barcodeElements += 1;
        else qrElements += 1;
        if ([90, 180, 270].includes(Number(element.rotation || 0))) rotatedCodes += 1;
        if (element.payload?.type === 'field') fieldPayloads += 1;
        else if (element.payload?.type === 'static') staticPayloads += 1;
        else if (element.payload?.type === 'composed') composedPayloads += 1;
      }
      if (template.status === 'active' && !inspectLayoutReadiness(layout).ready) activeUnready += 1;
    } catch (error) {
      invalidLayouts += 1;
    }
  }

  console.log('\nLabel Builder Barcode / QR audit (read-only)');
  console.log(`Templates: ${templates.length}`);
  console.log(`Barcode elements: ${barcodeElements}`);
  console.log(`QR elements: ${qrElements}`);
  console.log(`Rotated Barcode / QR elements: ${rotatedCodes}`);
  console.log(`Field payloads: ${fieldPayloads}`);
  console.log(`Static payloads: ${staticPayloads}`);
  console.log(`Composed payloads: ${composedPayloads}`);
  console.log(`Invalid config_json layouts: ${invalidLayouts}`);
  console.log(`Active templates failing layout readiness: ${activeUnready}`);
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
