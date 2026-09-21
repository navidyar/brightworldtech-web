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

  let layouts = 0;
  let layeredTemplates = 0;
  let totalElements = 0;
  let maxLayers = 0;
  let invalidLayouts = 0;
  let activeUnready = 0;

  for (const template of templates) {
    if (!template.storage_relative_path) continue;
    try {
      const layout = JSON.parse(await fs.promises.readFile(resolveAssetAbsolutePath(template.storage_relative_path), 'utf8'));
      const elements = Array.isArray(layout.elements) ? layout.elements : [];
      layouts += 1;
      totalElements += elements.length;
      maxLayers = Math.max(maxLayers, elements.length);
      if (elements.length > 1) layeredTemplates += 1;
      if (template.status === 'active' && !inspectLayoutReadiness(layout).ready) activeUnready += 1;
    } catch (error) {
      invalidLayouts += 1;
    }
  }

  console.log('\nLabel Builder Layer Ordering audit (read-only)');
  console.log(`Templates with config_json: ${layouts}`);
  console.log(`Templates with multiple layers: ${layeredTemplates}`);
  console.log(`Total drawable elements: ${totalElements}`);
  console.log(`Largest layer stack: ${maxLayers}`);
  console.log(`Invalid config_json layouts: ${invalidLayouts}`);
  console.log(`Active templates failing layout readiness: ${activeUnready}`);
  console.log('Layer order is stored by config_json element order; later elements render above earlier elements.');
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
