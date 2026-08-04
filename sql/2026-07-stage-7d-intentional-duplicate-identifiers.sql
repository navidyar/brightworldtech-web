-- Stage 7D corrective: permit approved Intentional Duplicates to retain matching serial identifiers.
-- Normal Create Unit remains protected by the application duplicate check. This change only removes
-- the database-wide serial uniqueness constraint that silently kept serials attached to the first Unit.

DROP PROCEDURE IF EXISTS bwt_stage7d_correct_identifier_indexes;
DELIMITER //
CREATE PROCEDURE bwt_stage7d_correct_identifier_indexes()
BEGIN
  DECLARE index_to_drop VARCHAR(64) DEFAULT NULL;
  DECLARE has_per_unit_unique INTEGER DEFAULT 0;
  DECLARE has_lookup_index INTEGER DEFAULT 0;

  -- Add a non-unique lookup index before dropping the old global unique index. This also
  -- keeps the identifier-type foreign key indexed if the old unique key was its only support.
  SELECT COUNT(*)
  INTO has_lookup_index
  FROM (
    SELECT s.index_name
    FROM information_schema.statistics s
    WHERE s.table_schema = DATABASE()
      AND s.table_name = 'unit_identifiers'
      AND s.non_unique = 1
    GROUP BY s.index_name
    HAVING GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ',') =
      'identifier_type_config_value_id,normalized_value'
  ) matching_lookup_indexes;

  IF has_lookup_index = 0 THEN
    ALTER TABLE unit_identifiers
      ADD KEY idx_unit_identifiers_type_normalized_lookup (
        identifier_type_config_value_id,
        normalized_value
      );
  END IF;

  drop_loop: LOOP
    SELECT MIN(global_indexes.index_name)
    INTO index_to_drop
    FROM (
      SELECT s.index_name
      FROM information_schema.statistics s
      WHERE s.table_schema = DATABASE()
        AND s.table_name = 'unit_identifiers'
        AND s.non_unique = 0
        AND s.index_name <> 'PRIMARY'
      GROUP BY s.index_name
      HAVING SUM(s.column_name = 'normalized_value') > 0
         AND SUM(s.column_name = 'unit_id') = 0
    ) global_indexes;

    IF index_to_drop IS NULL THEN
      LEAVE drop_loop;
    END IF;

    SET @drop_identifier_index_sql = CONCAT(
      'ALTER TABLE unit_identifiers DROP INDEX `',
      REPLACE(index_to_drop, '`', '``'),
      '`'
    );
    PREPARE drop_identifier_index_statement FROM @drop_identifier_index_sql;
    EXECUTE drop_identifier_index_statement;
    DEALLOCATE PREPARE drop_identifier_index_statement;
    SET index_to_drop = NULL;
  END LOOP;

  -- Remove only exact duplicate rows within one Unit before adding the per-Unit uniqueness guard.
  DELETE newer
  FROM unit_identifiers newer
  INNER JOIN unit_identifiers older
    ON older.unit_id = newer.unit_id
   AND older.identifier_type_config_value_id = newer.identifier_type_config_value_id
   AND older.normalized_value = newer.normalized_value
   AND older.unit_identifier_id < newer.unit_identifier_id;

  SELECT COUNT(*)
  INTO has_per_unit_unique
  FROM (
    SELECT s.index_name
    FROM information_schema.statistics s
    WHERE s.table_schema = DATABASE()
      AND s.table_name = 'unit_identifiers'
      AND s.non_unique = 0
    GROUP BY s.index_name
    HAVING GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ',') =
      'unit_id,identifier_type_config_value_id,normalized_value'
  ) matching_unique_indexes;

  IF has_per_unit_unique = 0 THEN
    ALTER TABLE unit_identifiers
      ADD UNIQUE KEY uq_unit_identifiers_unit_type_value (
        unit_id,
        identifier_type_config_value_id,
        normalized_value
      );
  END IF;

END//
DELIMITER ;

CALL bwt_stage7d_correct_identifier_indexes();
DROP PROCEDURE bwt_stage7d_correct_identifier_indexes;

-- Repair approved Intentional Duplicate records that created a Unit while the old global unique
-- index silently left the matching Unit Serial or BIOS Serial attached only to the original Unit.
SET @unit_serial_type_id = (
  SELECT cv.config_value_id
  FROM config_values cv
  INNER JOIN config_categories cc
    ON cc.config_category_id = cv.config_category_id
  WHERE cc.code = 'unit_identifier_types'
    AND cv.code = 'unit_serial_number'
  LIMIT 1
);

SET @bios_serial_type_id = (
  SELECT cv.config_value_id
  FROM config_values cv
  INNER JOIN config_categories cc
    ON cc.config_category_id = cv.config_category_id
  WHERE cc.code = 'unit_identifier_types'
    AND cv.code = 'bios_serial_number'
  LIMIT 1
);

INSERT INTO unit_identifiers (
  unit_id,
  identifier_type_config_value_id,
  identifier_value,
  normalized_value,
  is_primary
)
SELECT
  udr.created_unit_id,
  @unit_serial_type_id,
  UPPER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.unitSerialNumber')))),
  UPPER(REGEXP_REPLACE(
    TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.unitSerialNumber'))),
    '[^A-Za-z0-9]+',
    ''
  )),
  0
FROM unit_duplicate_requests udr
INNER JOIN unit_requests ur
  ON ur.unit_request_id = udr.unit_request_id
WHERE ur.request_type = 'intentional_duplicate'
  AND ur.status = 'approved'
  AND udr.created_unit_id IS NOT NULL
  AND @unit_serial_type_id IS NOT NULL
  AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.unitSerialNumber'))), '') IS NOT NULL
ON DUPLICATE KEY UPDATE
  identifier_value = VALUES(identifier_value),
  is_primary = VALUES(is_primary);

INSERT INTO unit_identifiers (
  unit_id,
  identifier_type_config_value_id,
  identifier_value,
  normalized_value,
  is_primary
)
SELECT
  udr.created_unit_id,
  @bios_serial_type_id,
  UPPER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.biosSerialNumber')))),
  UPPER(REGEXP_REPLACE(
    TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.biosSerialNumber'))),
    '[^A-Za-z0-9]+',
    ''
  )),
  0
FROM unit_duplicate_requests udr
INNER JOIN unit_requests ur
  ON ur.unit_request_id = udr.unit_request_id
WHERE ur.request_type = 'intentional_duplicate'
  AND ur.status = 'approved'
  AND udr.created_unit_id IS NOT NULL
  AND @bios_serial_type_id IS NOT NULL
  AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.formData.biosSerialNumber'))), '') IS NOT NULL
ON DUPLICATE KEY UPDATE
  identifier_value = VALUES(identifier_value),
  is_primary = VALUES(is_primary);

SELECT 'Stage 7D Intentional Duplicate identifier correction complete' AS message;
