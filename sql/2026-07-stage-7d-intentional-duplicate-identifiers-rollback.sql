-- Rollback is possible only when no identifier value is intentionally shared by multiple Units.

DROP PROCEDURE IF EXISTS bwt_stage7d_rollback_identifier_indexes;
DELIMITER //
CREATE PROCEDURE bwt_stage7d_rollback_identifier_indexes()
BEGIN
  DECLARE shared_identifier_count BIGINT DEFAULT 0;
  DECLARE per_unit_index_name VARCHAR(64) DEFAULT NULL;
  DECLARE has_global_unique INTEGER DEFAULT 0;

  SELECT COUNT(*)
  INTO shared_identifier_count
  FROM (
    SELECT identifier_type_config_value_id, normalized_value
    FROM unit_identifiers
    WHERE normalized_value IS NOT NULL
      AND normalized_value <> ''
    GROUP BY identifier_type_config_value_id, normalized_value
    HAVING COUNT(DISTINCT unit_id) > 1
  ) shared_identifiers;

  IF shared_identifier_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Rollback stopped: approved Intentional Duplicates share identifiers across Units. Remove those duplicate records before restoring global uniqueness.';
  END IF;

  SELECT MAX(matching_indexes.index_name)
  INTO per_unit_index_name
  FROM (
    SELECT s.index_name
    FROM information_schema.statistics s
    WHERE s.table_schema = DATABASE()
      AND s.table_name = 'unit_identifiers'
      AND s.non_unique = 0
    GROUP BY s.index_name
    HAVING GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ',') =
      'unit_id,identifier_type_config_value_id,normalized_value'
  ) matching_indexes;

  IF per_unit_index_name IS NOT NULL THEN
    SET @drop_per_unit_index_sql = CONCAT(
      'ALTER TABLE unit_identifiers DROP INDEX `',
      REPLACE(per_unit_index_name, '`', '``'),
      '`'
    );
    PREPARE drop_per_unit_index_statement FROM @drop_per_unit_index_sql;
    EXECUTE drop_per_unit_index_statement;
    DEALLOCATE PREPARE drop_per_unit_index_statement;
  END IF;

  SELECT COUNT(*)
  INTO has_global_unique
  FROM (
    SELECT s.index_name
    FROM information_schema.statistics s
    WHERE s.table_schema = DATABASE()
      AND s.table_name = 'unit_identifiers'
      AND s.non_unique = 0
    GROUP BY s.index_name
    HAVING GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ',') =
      'identifier_type_config_value_id,normalized_value'
  ) matching_indexes;

  IF has_global_unique = 0 THEN
    ALTER TABLE unit_identifiers
      ADD UNIQUE KEY uq_unit_identifiers_type_normalized (
        identifier_type_config_value_id,
        normalized_value
      );
  END IF;
END//
DELIMITER ;

CALL bwt_stage7d_rollback_identifier_indexes();
DROP PROCEDURE bwt_stage7d_rollback_identifier_indexes;

SELECT 'Stage 7D Intentional Duplicate identifier correction rolled back' AS message;
