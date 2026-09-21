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

  let lineElements = 0;
  let outlineRectangles = 0;
  let filledRectangles = 0;
  let rotatedShapes = 0;
  let invalidLayouts = 0;
  let activeUnready = 0;

  for (const template of templates) {
    if (!template.storage_relative_path) continue;
    try {
      const layout = JSON.parse(await fs.promises.readFile(resolveAssetAbsolutePath(template.storage_relative_path), 'utf8'));
      for (const element of Array.isArray(layout.elements) ? layout.elements : []) {
        if (element?.type === 'line') lineElements += 1;
        if (element?.type === 'rectangle') {
          if (element.fill === 'filled') filledRectangles += 1;
          else outlineRectangles += 1;
        }
        if ((element?.type === 'line' || element?.type === 'rectangle') && [90, 180, 270].includes(Number(element.rotation || 0))) {
          rotatedShapes += 1;
        }
      }
      if (template.status === 'active' && !inspectLayoutReadiness(layout).ready) activeUnready += 1;
    } catch (error) {
      invalidLayouts += 1;
    }
  }

  console.log('\nLabel Builder Line / Rectangle audit (read-only)');
  console.log(`Templates: ${templates.length}`);
  console.log(`Line elements: ${lineElements}`);
  console.log(`Outline Rectangle elements: ${outlineRectangles}`);
  console.log(`Filled Rectangle elements: ${filledRectangles}`);
  console.log(`Rotated Line / Rectangle elements: ${rotatedShapes}`);
  console.log(`Invalid config_json layouts: ${invalidLayouts}`);
  console.log(`Active templates failing layout readiness: ${activeUnready}`);
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
