'use strict';

const fs = require('node:fs');
const { pool } = require('../models/db');
const { resolveAssetAbsolutePath } = require('../services/labelAssetStorage');
const { inspectLayoutReadiness } = require('../services/labelBuilderLayoutPolicy');

async function main() {
  const [templates] = await pool.query(`
    SELECT template.label_template_id, template.name, template.status, template.print_scope,
      asset.storage_relative_path
    FROM label_templates template
    LEFT JOIN label_template_asset_links link
      ON link.label_template_id = template.label_template_id AND link.role = 'config_json'
    LEFT JOIN label_assets asset ON asset.asset_id = link.asset_id
    ORDER BY template.label_template_id
  `);
  const [[lotAssignmentRow]] = await pool.query(`
    SELECT COUNT(*) AS count
    FROM lot_label_templates assignment
    INNER JOIN label_templates template ON template.label_template_id = assignment.label_template_id
    WHERE template.print_scope = 'standalone'
  `);

  let lotTemplates = 0;
  let standaloneTemplates = 0;
  let invalidScopes = 0;
  let staticText = 0;
  let dynamicText = 0;
  let rotatedElements = 0;
  let invalidLayouts = 0;
  let activeUnready = 0;

  for (const template of templates) {
    if (template.print_scope === 'lot') lotTemplates += 1;
    else if (template.print_scope === 'standalone') standaloneTemplates += 1;
    else invalidScopes += 1;
    if (!template.storage_relative_path) continue;
    try {
      const layout = JSON.parse(await fs.promises.readFile(resolveAssetAbsolutePath(template.storage_relative_path), 'utf8'));
      const elements = Array.isArray(layout.elements) ? layout.elements : [];
      staticText += elements.filter((element) => element?.type === 'static_text').length;
      dynamicText += elements.filter((element) => element?.type === 'dynamic_text').length;
      rotatedElements += elements.filter((element) => [90, 180, 270].includes(Number(element?.rotation || 0))).length;
      if (template.status === 'active' && !inspectLayoutReadiness(layout).ready) activeUnready += 1;
    } catch (error) {
      invalidLayouts += 1;
    }
  }

  console.log('\nLabel Builder Text + Print Availability audit (read-only)');
  console.log(`Templates: ${templates.length}`);
  console.log(`Lot Selection templates: ${lotTemplates}`);
  console.log(`Standalone templates: ${standaloneTemplates}`);
  console.log(`Invalid print_scope values: ${invalidScopes}`);
  console.log(`Standalone templates assigned to Lots: ${Number(lotAssignmentRow?.count || 0)}`);
  console.log(`Static Text elements: ${staticText}`);
  console.log(`Dynamic Text elements: ${dynamicText}`);
  console.log(`Rotated elements: ${rotatedElements}`);
  console.log(`Invalid config_json layouts: ${invalidLayouts}`);
  console.log(`Active templates failing layout readiness: ${activeUnready}`);
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
