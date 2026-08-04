'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

async function main() {
  const [globalUniqueIndexes] = await pool.query(
    `
      SELECT s.index_name
      FROM information_schema.statistics s
      WHERE s.table_schema = DATABASE()
        AND s.table_name = 'unit_identifiers'
        AND s.non_unique = 0
        AND s.index_name <> 'PRIMARY'
      GROUP BY s.index_name
      HAVING SUM(s.column_name = 'normalized_value') > 0
         AND SUM(s.column_name = 'unit_id') = 0
    `
  );

  if (globalUniqueIndexes.length > 0) {
    throw new Error(`Global identifier uniqueness is still active through index ${globalUniqueIndexes[0].index_name}.`);
  }

  const [perUnitUniqueIndexes] = await pool.query(
    `
      SELECT s.index_name
      FROM information_schema.statistics s
      WHERE s.table_schema = DATABASE()
        AND s.table_name = 'unit_identifiers'
        AND s.non_unique = 0
      GROUP BY s.index_name
      HAVING GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ',') =
        'unit_id,identifier_type_config_value_id,normalized_value'
    `
  );

  if (perUnitUniqueIndexes.length === 0) {
    throw new Error('The per-Unit identifier uniqueness index is missing.');
  }

  const [[approvalCounts]] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN ur.status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN ur.status = 'approved' AND udr.created_unit_id IS NULL THEN 1 ELSE 0 END) AS approved_without_unit_count
      FROM unit_requests ur
      INNER JOIN unit_duplicate_requests udr
        ON udr.unit_request_id = ur.unit_request_id
      WHERE ur.request_type = 'intentional_duplicate'
    `
  );

  if (Number(approvalCounts.approved_without_unit_count || 0) > 0) {
    throw new Error(`${approvalCounts.approved_without_unit_count} approved Intentional Duplicate request(s) have no created Unit.`);
  }

  const [[missingSerials]] = await pool.query(
    `
      SELECT COUNT(*) AS missing_count
      FROM (
        SELECT
          udr.unit_request_id,
          udr.created_unit_id,
          cv.config_value_id AS identifier_type_id,
          UPPER(REGEXP_REPLACE(
            TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.unitSerialNumber'))),
            '[^A-Za-z0-9]+',
            ''
          )) AS normalized_value
        FROM unit_duplicate_requests udr
        INNER JOIN unit_requests ur
          ON ur.unit_request_id = udr.unit_request_id
        INNER JOIN config_categories cc
          ON cc.code = 'unit_identifier_types'
        INNER JOIN config_values cv
          ON cv.config_category_id = cc.config_category_id
         AND cv.code = 'unit_serial_number'
        WHERE ur.request_type = 'intentional_duplicate'
          AND ur.status = 'approved'
          AND udr.created_unit_id IS NOT NULL
          AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.unitSerialNumber'))), '') IS NOT NULL

        UNION ALL

        SELECT
          udr.unit_request_id,
          udr.created_unit_id,
          cv.config_value_id AS identifier_type_id,
          UPPER(REGEXP_REPLACE(
            TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.biosSerialNumber'))),
            '[^A-Za-z0-9]+',
            ''
          )) AS normalized_value
        FROM unit_duplicate_requests udr
        INNER JOIN unit_requests ur
          ON ur.unit_request_id = udr.unit_request_id
        INNER JOIN config_categories cc
          ON cc.code = 'unit_identifier_types'
        INNER JOIN config_values cv
          ON cv.config_category_id = cc.config_category_id
         AND cv.code = 'bios_serial_number'
        WHERE ur.request_type = 'intentional_duplicate'
          AND ur.status = 'approved'
          AND udr.created_unit_id IS NOT NULL
          AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.biosSerialNumber'))), '') IS NOT NULL
      ) expected
      LEFT JOIN unit_identifiers ui
        ON ui.unit_id = expected.created_unit_id
       AND ui.identifier_type_config_value_id = expected.identifier_type_id
       AND ui.normalized_value = expected.normalized_value
      WHERE ui.unit_identifier_id IS NULL
    `
  );

  if (Number(missingSerials.missing_count || 0) > 0) {
    throw new Error(`${missingSerials.missing_count} approved Intentional Duplicate serial identifier(s) are missing from their created Unit.`);
  }

  const [[sharedSerials]] = await pool.query(
    `
      SELECT COUNT(*) AS shared_group_count
      FROM (
        SELECT ui.identifier_type_config_value_id, ui.normalized_value
        FROM unit_identifiers ui
        INNER JOIN config_values cv
          ON cv.config_value_id = ui.identifier_type_config_value_id
        INNER JOIN config_categories cc
          ON cc.config_category_id = cv.config_category_id
        WHERE cc.code = 'unit_identifier_types'
          AND cv.code IN ('unit_serial_number', 'bios_serial_number')
        GROUP BY ui.identifier_type_config_value_id, ui.normalized_value
        HAVING COUNT(DISTINCT ui.unit_id) > 1
      ) shared
    `
  );

  console.log(
    `Intentional Duplicate identifiers valid: ${Number(approvalCounts.approved_count || 0)} approved requests, ${Number(sharedSerials.shared_group_count || 0)} shared serial groups, 0 missing created-unit serials.`
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
