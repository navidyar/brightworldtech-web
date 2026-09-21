'use strict';

const fs = require('node:fs');
const { pool } = require('../models/db');
const { resolveAssetAbsolutePath } = require('../services/labelAssetStorage');
const { inspectLayoutReadiness } = require('../services/labelBuilderLayoutPolicy');

const ALLOWED_KINDS = new Set(['logo', 'image', 'background']);
const ALLOWED_MIME = new Set(['image/png', 'image/svg+xml']);

async function main() {
  const [templates] = await pool.query(`
    SELECT template.label_template_id, template.name, template.status, asset.storage_relative_path
    FROM label_templates template
    LEFT JOIN label_template_asset_links link
      ON link.label_template_id = template.label_template_id AND link.role = 'config_json'
    LEFT JOIN label_assets asset ON asset.asset_id = link.asset_id
    ORDER BY template.label_template_id
  `);
  const [links] = await pool.query(`
    SELECT link.label_template_id, link.asset_key, asset.asset_id, asset.asset_kind, asset.status, asset.mime_type
    FROM label_template_asset_links link
    INNER JOIN label_assets asset ON asset.asset_id = link.asset_id
    WHERE link.role = 'layout_asset'
  `);
  const linksByTemplate = new Map();
  for (const link of links) {
    const id = Number(link.label_template_id);
    if (!linksByTemplate.has(id)) linksByTemplate.set(id, new Map());
    linksByTemplate.get(id).set(String(link.asset_key), link);
  }

  let imageElements = 0;
  let rotatedImages = 0;
  let lockedImages = 0;
  let invalidLayouts = 0;
  let missingLinks = 0;
  let invalidLinkedAssets = 0;
  let activeUnready = 0;

  for (const template of templates) {
    if (!template.storage_relative_path) continue;
    try {
      const layout = JSON.parse(await fs.promises.readFile(resolveAssetAbsolutePath(template.storage_relative_path), 'utf8'));
      const templateLinks = linksByTemplate.get(Number(template.label_template_id)) || new Map();
      const elements = Array.isArray(layout.elements) ? layout.elements : [];
      for (const element of elements.filter((candidate) => candidate?.type === 'image')) {
        imageElements += 1;
        if ([90, 180, 270].includes(Number(element.rotation || 0))) rotatedImages += 1;
        if (element.lockAspectRatio !== false) lockedImages += 1;
        const linked = templateLinks.get(String(element.assetKey || ''));
        if (!linked) {
          missingLinks += 1;
          continue;
        }
        if (String(linked.status) !== 'active' || !ALLOWED_KINDS.has(String(linked.asset_kind)) || !ALLOWED_MIME.has(String(linked.mime_type))) {
          invalidLinkedAssets += 1;
        }
      }
      if (template.status === 'active' && !inspectLayoutReadiness(layout).ready) activeUnready += 1;
    } catch (error) {
      invalidLayouts += 1;
    }
  }

  console.log('\nLabel Builder Image Objects audit (read-only)');
  console.log(`Templates: ${templates.length}`);
  console.log(`Image elements: ${imageElements}`);
  console.log(`Images with aspect ratio locked: ${lockedImages}`);
  console.log(`Rotated image elements: ${rotatedImages}`);
  console.log(`Reusable layout-asset links: ${links.length}`);
  console.log(`Image elements missing layout-asset links: ${missingLinks}`);
  console.log(`Invalid linked image assets: ${invalidLinkedAssets}`);
  console.log(`Invalid config_json layouts: ${invalidLayouts}`);
  console.log(`Active templates failing layout readiness: ${activeUnready}`);
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
