'use strict';

const fs = require('node:fs');
const { pool } = require('../models/db');
const labelLibraryModel = require('../models/labelLibraryModel');
const { resolveAssetAbsolutePath } = require('../services/labelAssetStorage');
const { inspectLayoutReadiness } = require('../services/labelBuilderLayoutPolicy');
const { buildComposedValuePresets } = require('../services/labelComposedValuePresets');

async function main() {
  const rows = await labelLibraryModel.listCurrentTemplateConfigAssets();
  const entries = [];
  let composedTextElements = 0;
  let composedCodePayloads = 0;
  let invalidLayouts = 0;
  let activeUnready = 0;

  for (const row of rows) {
    try {
      const layout = JSON.parse(await fs.promises.readFile(resolveAssetAbsolutePath(row.storage_relative_path), 'utf8'));
      entries.push({ updatedAt: row.template_updated_at, layout });
      for (const element of Array.isArray(layout.elements) ? layout.elements : []) {
        if (element?.type === 'composed_text') composedTextElements += 1;
        if ((element?.type === 'barcode' || element?.type === 'qr') && element.payload?.type === 'composed') composedCodePayloads += 1;
      }
      if (row.template_status === 'active' && !inspectLayoutReadiness(layout).ready) activeUnready += 1;
    } catch (error) {
      invalidLayouts += 1;
    }
  }

  const presets = buildComposedValuePresets(entries);
  console.log('\nLabel Builder Composed Value audit (read-only)');
  console.log(`Current Draft/Active config_json layouts: ${rows.length}`);
  console.log(`Composed Text elements: ${composedTextElements}`);
  console.log(`Composed Barcode/QR payloads: ${composedCodePayloads}`);
  console.log(`Learned Common presets: ${presets.common.length}`);
  console.log(`Learned Recent presets: ${presets.recent.length}`);
  console.log(`Starter presets: ${presets.starter.length}`);
  console.log(`Invalid config_json layouts: ${invalidLayouts}`);
  console.log(`Active templates failing layout readiness: ${activeUnready}`);
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
