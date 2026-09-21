'use strict';

const fs = require('node:fs');
const { pool } = require('../models/db');
const { resolveAssetAbsolutePath } = require('../services/labelAssetStorage');
const { inspectLayoutReadiness } = require('../services/labelBuilderLayoutPolicy');

async function main() {
  const [templates] = await pool.query(`
    SELECT template.label_template_id, template.name, template.status,
      template.printer_profile_code, template.media_code, template.canvas_width_dots, template.canvas_height_dots,
      asset.storage_relative_path
    FROM label_templates template
    LEFT JOIN label_template_asset_links link
      ON link.label_template_id = template.label_template_id AND link.role = 'config_json'
    LEFT JOIN label_assets asset ON asset.asset_id = link.asset_id
    ORDER BY template.label_template_id
  `);

  let draftBuilderLayouts = 0;
  let unconfiguredRegions = 0;
  let invalidLayouts = 0;
  let activeUnreadyLayouts = 0;
  let missingMediaGeometry = 0;

  for (const template of templates) {
    if (!template.printer_profile_code || !template.media_code || !template.canvas_width_dots || !template.canvas_height_dots) {
      missingMediaGeometry += 1;
    }
    if (!template.storage_relative_path) continue;
    try {
      const layout = JSON.parse(await fs.promises.readFile(resolveAssetAbsolutePath(template.storage_relative_path), 'utf8'));
      const readiness = inspectLayoutReadiness(layout);
      const elements = Array.isArray(layout.elements) ? layout.elements : [];
      const openRegions = elements.filter((element) => String(element?.type || '') === 'unconfigured').length;
      unconfiguredRegions += openRegions;
      if (template.status === 'draft' && Number(layout.builderVersion || 0) >= 1) draftBuilderLayouts += 1;
      if (template.status === 'active' && !readiness.ready) activeUnreadyLayouts += 1;
    } catch (error) {
      invalidLayouts += 1;
    }
  }

  console.log('\nLabel Builder Foundation audit (read-only)');
  console.log(`Templates: ${templates.length}`);
  console.log(`Draft Builder layouts: ${draftBuilderLayouts}`);
  console.log(`Unconfigured Draft regions: ${unconfiguredRegions}`);
  console.log(`Invalid config_json layouts: ${invalidLayouts}`);
  console.log(`Active templates failing layout readiness: ${activeUnreadyLayouts}`);
  console.log(`Templates missing media geometry: ${missingMediaGeometry}`);
  console.log('Builder layouts are JSON instructions only; no flattened label preview is persisted.');
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
