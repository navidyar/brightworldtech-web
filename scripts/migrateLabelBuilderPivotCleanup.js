'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { deleteContentAddressedAsset } = require('../services/labelAssetStorage');

const APPLY = process.argv.includes('--apply');
const OBSOLETE_LINK_ROLES = Object.freeze(['original_sample', 'background_candidate', 'sample_analysis', 'preview']);
const SAMPLE_TEMPLATE_ROLES = Object.freeze(['original_sample', 'background_candidate', 'sample_analysis']);
const OBSOLETE_ASSET_KINDS = Object.freeze(['analysis_json', 'original_sample', 'preview']);
const ALLOWED_ASSET_KINDS = Object.freeze(['logo', 'image', 'background', 'config_json']);
const IMAGE_ASSET_KINDS = Object.freeze(['logo', 'image', 'background']);
const OBSOLETE_EVENT_TYPES = Object.freeze([
  'template_sample_imported',
  'template_sample_analyzed',
  'template_sample_analysis_reviewed',
  'template_sample_analysis_region_added',
  'template_sample_graphics_extracted',
  'template_sample_field_mapping_saved',
  'template_sample_code_mapping_saved',
  'template_layout_generated'
]);
const SAMPLE_ASSET_KEY_PREFIX = 'sample_region_';

async function columnExists(connection, tableName, columnName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(row?.row_count || 0) === 1;
}

function sampleAssetKeyPredicate(alias = 'link') {
  return `LEFT(${alias}.asset_key, ?) = ?`;
}

async function listLegacyWorkflowTemplates(connection, hasImportedAt) {
  const importedPredicate = hasImportedAt ? 'template.imported_at IS NOT NULL OR' : '';
  const [rows] = await connection.query(`
    SELECT DISTINCT
      template.label_template_id,
      template.name,
      template.status,
      ${hasImportedAt ? 'template.imported_at' : 'NULL AS imported_at'},
      (SELECT COUNT(*) FROM lot_label_templates assignment
        WHERE assignment.label_template_id = template.label_template_id) AS lot_assignment_count,
      (SELECT COUNT(*) FROM label_print_job_items item
        WHERE item.label_template_id = template.label_template_id) AS print_history_count
    FROM label_templates template
    WHERE ${importedPredicate}
      EXISTS (
        SELECT 1
        FROM label_template_asset_links sample_link
        WHERE sample_link.label_template_id = template.label_template_id
          AND (
            sample_link.role IN (?)
            OR ${sampleAssetKeyPredicate('sample_link')}
          )
      )
    ORDER BY template.label_template_id
  `, [SAMPLE_TEMPLATE_ROLES, SAMPLE_ASSET_KEY_PREFIX.length, SAMPLE_ASSET_KEY_PREFIX]);
  return rows;
}

async function listLegacyLotImpacts(connection, legacyTemplateIds) {
  if (!legacyTemplateIds.length) return [];
  const [rows] = await connection.query(`
    SELECT assignment.lot_id, lot.name AS lot_name,
      SUM(CASE WHEN assignment.label_template_id IN (?) THEN 1 ELSE 0 END) AS legacy_assignment_count,
      SUM(CASE WHEN assignment.label_template_id NOT IN (?) THEN 1 ELSE 0 END) AS retained_assignment_count
    FROM lot_label_templates assignment
    INNER JOIN lots lot ON lot.lot_id = assignment.lot_id
    WHERE assignment.lot_id IN (
      SELECT DISTINCT legacy_assignment.lot_id
      FROM lot_label_templates legacy_assignment
      WHERE legacy_assignment.label_template_id IN (?)
    )
    GROUP BY assignment.lot_id, lot.name
    ORDER BY lot.name, assignment.lot_id
  `, [legacyTemplateIds, legacyTemplateIds, legacyTemplateIds]);
  return rows.map((row) => ({
    lotId: Number(row.lot_id),
    lotName: String(row.lot_name || `Lot ${row.lot_id}`),
    legacyAssignmentCount: Number(row.legacy_assignment_count || 0),
    retainedAssignmentCount: Number(row.retained_assignment_count || 0)
  }));
}

async function inspect(connection) {
  const hasImportedAt = await columnExists(connection, 'label_templates', 'imported_at');
  const legacyTemplates = await listLegacyWorkflowTemplates(connection, hasImportedAt);
  const legacyTemplateIds = legacyTemplates.map((row) => Number(row.label_template_id)).filter(Number.isInteger);
  const legacyLotImpacts = await listLegacyLotImpacts(connection, legacyTemplateIds);

  const [obsoleteLinks] = await connection.query(`
    SELECT link.label_template_asset_link_id, link.label_template_id, link.asset_id, link.asset_key, link.role,
           asset.asset_kind, asset.storage_relative_path
    FROM label_template_asset_links link
    INNER JOIN label_assets asset ON asset.asset_id = link.asset_id
    WHERE link.role IN (?) OR ${sampleAssetKeyPredicate('link')}
    ORDER BY link.label_template_asset_link_id
  `, [OBSOLETE_LINK_ROLES, SAMPLE_ASSET_KEY_PREFIX.length, SAMPLE_ASSET_KEY_PREFIX]);

  const [obsoleteAssets] = await connection.query(`
    SELECT asset_id, name, asset_kind, mime_type, storage_relative_path
    FROM label_assets
    WHERE asset_kind IN (?)
    ORDER BY asset_id
  `, [OBSOLETE_ASSET_KINDS]);

  const [[obsoleteEvents]] = await connection.query(`
    SELECT COUNT(*) AS row_count
    FROM label_library_audit_events
    WHERE event_type IN (?)
  `, [OBSOLETE_EVENT_TYPES]);

  const [[unsupportedImages]] = await connection.query(`
    SELECT COUNT(*) AS row_count
    FROM label_assets
    WHERE asset_kind IN (?)
      AND mime_type NOT IN ('image/png', 'image/svg+xml')
  `, [IMAGE_ASSET_KINDS]);

  const [[unexpectedKinds]] = await connection.query(`
    SELECT COUNT(*) AS row_count
    FROM label_assets
    WHERE asset_kind NOT IN (?) AND asset_kind NOT IN (?)
  `, [ALLOWED_ASSET_KINDS, OBSOLETE_ASSET_KINDS]);

  const [[invalidConfigMime]] = await connection.query(`
    SELECT COUNT(*) AS row_count
    FROM label_assets
    WHERE asset_kind = 'config_json' AND mime_type <> 'application/json'
  `);

  const blockers = legacyTemplates.filter((template) => (
    String(template.status) === 'active'
    || Number(template.print_history_count || 0) > 0
  ));
  const autoDetachTemplates = legacyTemplates.filter((template) => (
    String(template.status) !== 'active'
    && Number(template.print_history_count || 0) === 0
    && Number(template.lot_assignment_count || 0) > 0
  ));

  return {
    hasImportedAt,
    legacyTemplates,
    legacyLotImpacts,
    autoDetachTemplates,
    obsoleteLinks,
    obsoleteAssets,
    obsoleteEventCount: Number(obsoleteEvents?.row_count || 0),
    unsupportedImageAssetCount: Number(unsupportedImages?.row_count || 0),
    unexpectedAssetKindCount: Number(unexpectedKinds?.row_count || 0),
    invalidConfigMimeCount: Number(invalidConfigMime?.row_count || 0),
    blockers
  };
}

function printReport(label, state) {
  console.log(`\nLabel Builder pivot cleanup (${label})`);
  console.log(`Legacy imported_at column: ${state.hasImportedAt ? 'present' : 'absent'}`);
  console.log(`Legacy import/sample templates: ${state.legacyTemplates.length}`);
  console.log(`Obsolete sample/preview asset links: ${state.obsoleteLinks.length}`);
  console.log(`Obsolete sample/preview asset rows: ${state.obsoleteAssets.length}`);
  console.log(`Obsolete sample-workflow audit events: ${state.obsoleteEventCount}`);
  console.log(`Reusable image assets outside PNG/SVG: ${state.unsupportedImageAssetCount}`);
  console.log(`Unexpected non-legacy asset kinds: ${state.unexpectedAssetKindCount}`);
  console.log(`config_json assets with wrong MIME type: ${state.invalidConfigMimeCount}`);
  console.log(`Auto-detachable Draft/Archived legacy templates with Lot assignments: ${state.autoDetachTemplates.length}`);
  console.log(`Blocking legacy templates: ${state.blockers.length}`);

  for (const template of state.legacyTemplates) {
    console.log(
      `  #${template.label_template_id} ${template.name} · ${template.status}`
      + ` · Lot assignments ${template.lot_assignment_count}`
      + ` · print-history items ${template.print_history_count}`
    );
  }

  if (state.legacyLotImpacts.length) {
    console.log('\nLegacy Lot assignment cleanup plan:');
    for (const impact of state.legacyLotImpacts) {
      const action = impact.retainedAssignmentCount === 0
        ? 'remove direct set and reset this Lot to label inheritance'
        : `remove legacy assignment(s) and keep ${impact.retainedAssignmentCount} non-legacy direct assignment(s)`;
      console.log(
        `  Lot #${impact.lotId} ${impact.lotName} · remove ${impact.legacyAssignmentCount} legacy assignment(s)`
        + ` · ${action}`
      );
    }
  }

  if (state.blockers.length) {
    console.log('\nBLOCKED: Active legacy templates or legacy templates referenced by print history are not deleted automatically.');
  } else if (state.autoDetachTemplates.length) {
    console.log('\nSAFE CLEANUP: Draft/Archived legacy templates with no print history will be detached from Lots during apply.');
  }
}

async function collectCandidateAssetIds(connection, legacyTemplateIds) {
  const candidateIds = new Set();

  const [obsoleteLinkRows] = await connection.query(`
    SELECT asset_id
    FROM label_template_asset_links link
    WHERE link.role IN (?) OR ${sampleAssetKeyPredicate('link')}
  `, [OBSOLETE_LINK_ROLES, SAMPLE_ASSET_KEY_PREFIX.length, SAMPLE_ASSET_KEY_PREFIX]);
  obsoleteLinkRows.forEach((row) => candidateIds.add(Number(row.asset_id)));

  if (legacyTemplateIds.length) {
    const [legacyAssetRows] = await connection.query(
      `SELECT DISTINCT asset_id
       FROM label_template_asset_links
       WHERE label_template_id IN (?)`,
      [legacyTemplateIds]
    );
    legacyAssetRows.forEach((row) => candidateIds.add(Number(row.asset_id)));
  }

  const [obsoleteKindRows] = await connection.query(
    'SELECT asset_id FROM label_assets WHERE asset_kind IN (?)',
    [OBSOLETE_ASSET_KINDS]
  );
  obsoleteKindRows.forEach((row) => candidateIds.add(Number(row.asset_id)));

  return [...candidateIds].filter(Number.isInteger);
}

async function applyCleanup(connection, before) {
  if (before.blockers.length) {
    throw new Error('Label Builder cleanup is blocked by legacy import/sample templates that are Active or referenced by print history.');
  }
  if (before.unsupportedImageAssetCount > 0) {
    throw new Error('Label Builder cleanup found reusable image assets outside PNG/SVG. Remove or replace them before applying the PNG/SVG-only asset policy.');
  }
  if (before.unexpectedAssetKindCount > 0 || before.invalidConfigMimeCount > 0) {
    throw new Error('Label Builder cleanup found unexpected persistent asset data. Stop for manual inspection before applying cleanup.');
  }

  const legacyTemplateIds = before.legacyTemplates.map((row) => Number(row.label_template_id));
  const candidateAssetIds = await collectCandidateAssetIds(connection, legacyTemplateIds);
  const deletedAssetFiles = [];

  await connection.beginTransaction();
  try {
    const resetToInheritanceLotIds = before.legacyLotImpacts
      .filter((impact) => impact.retainedAssignmentCount === 0)
      .map((impact) => impact.lotId);
    if (resetToInheritanceLotIds.length) {
      // A direct set containing only abandoned legacy templates should disappear with the legacy
      // workflow. Deleting the set restores normal parent inheritance instead of leaving behind
      // an accidental explicit-empty set that would block inheritance.
      await connection.query(
        'DELETE FROM lot_label_template_sets WHERE lot_id IN (?)',
        [resetToInheritanceLotIds]
      );
    }

    await connection.query(
      `DELETE FROM label_template_asset_links
       WHERE role IN (?) OR ${sampleAssetKeyPredicate('label_template_asset_links')}`,
      [OBSOLETE_LINK_ROLES, SAMPLE_ASSET_KEY_PREFIX.length, SAMPLE_ASSET_KEY_PREFIX]
    );

    if (legacyTemplateIds.length) {
      await connection.query(
        `DELETE FROM label_library_audit_events
         WHERE entity_type = 'label_template' AND entity_id IN (?)`,
        [legacyTemplateIds]
      );
      await connection.query(
        'DELETE FROM label_templates WHERE label_template_id IN (?)',
        [legacyTemplateIds]
      );
    }

    await connection.query(
      'DELETE FROM label_library_audit_events WHERE event_type IN (?)',
      [OBSOLETE_EVENT_TYPES]
    );

    if (candidateAssetIds.length) {
      const [orphanedAssets] = await connection.query(
        `SELECT asset.asset_id, asset.storage_relative_path
         FROM label_assets asset
         LEFT JOIN label_template_asset_links link ON link.asset_id = asset.asset_id
         WHERE asset.asset_id IN (?)
         GROUP BY asset.asset_id, asset.storage_relative_path
         HAVING COUNT(link.label_template_asset_link_id) = 0`,
        [candidateAssetIds]
      );

      if (orphanedAssets.length) {
        await connection.query(
          'DELETE FROM label_assets WHERE asset_id IN (?)',
          [orphanedAssets.map((row) => Number(row.asset_id))]
        );
        deletedAssetFiles.push(...orphanedAssets.map((row) => String(row.storage_relative_path)));
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  if (before.hasImportedAt) {
    await connection.query('ALTER TABLE label_templates DROP COLUMN imported_at');
  }

  for (const relativePath of deletedAssetFiles) {
    try {
      await deleteContentAddressedAsset(relativePath);
    } catch (error) {
      console.warn(`Could not delete obsolete Label Library asset file ${relativePath}: ${error.message}`);
    }
  }

  return { deletedAssetFiles };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    printReport(APPLY ? 'pre-apply' : 'dry-run', before);

    if (!APPLY) {
      console.log('\nNo changes were made. Review the report, then run the migrate command to apply cleanup.');
      return;
    }

    const result = await applyCleanup(connection, before);
    const after = await inspect(connection);
    printReport('post-apply', after);
    console.log(`Deleted obsolete asset files: ${result.deletedAssetFiles.length}`);

    if (after.hasImportedAt
      || after.legacyTemplates.length
      || after.obsoleteLinks.length
      || after.obsoleteAssets.length
      || after.obsoleteEventCount
      || after.unsupportedImageAssetCount
      || after.unexpectedAssetKindCount
      || after.invalidConfigMimeCount) {
      throw new Error('Label Builder cleanup did not reach a clean post-apply state.');
    }

    console.log('\nLabel Builder pivot cleanup applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
