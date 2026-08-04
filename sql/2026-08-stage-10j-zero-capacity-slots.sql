-- Stage 10J: allow explicit zero-capacity component rows to represent empty slots/bays.
-- This migration is non-destructive. It changes only capacity CHECK constraints
-- and the memory install-type nullability required for an empty memory slot.

DROP PROCEDURE IF EXISTS stage10j_replace_capacity_check;
DROP PROCEDURE IF EXISTS stage10j_allow_null_memory_install_type;

DELIMITER //
CREATE PROCEDURE stage10j_replace_capacity_check(
  IN target_table_name VARCHAR(64),
  IN target_column_name VARCHAR(64),
  IN target_constraint_name VARCHAR(64)
)
BEGIN
  DECLARE finished INTEGER DEFAULT 0;
  DECLARE existing_constraint_name VARCHAR(64);
  DECLARE table_count INTEGER DEFAULT 0;
  DECLARE column_count INTEGER DEFAULT 0;

  DECLARE capacity_check_cursor CURSOR FOR
    SELECT tc.CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS tc
    INNER JOIN information_schema.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
     AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
      AND tc.TABLE_NAME = target_table_name
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND LOWER(cc.CHECK_CLAUSE) REGEXP CONCAT(
        '(^|[^a-z0-9_])`?',
        LOWER(target_column_name),
        '`?([^a-z0-9_]|$)'
      );

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;

  SELECT COUNT(*) INTO table_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = target_table_name;

  SELECT COUNT(*) INTO column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = target_table_name
    AND COLUMN_NAME = target_column_name;

  IF table_count <> 1 OR column_count <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10J requires every hardware capacity table and column.';
  END IF;

  OPEN capacity_check_cursor;

  drop_capacity_checks: LOOP
    FETCH capacity_check_cursor INTO existing_constraint_name;

    IF finished = 1 THEN
      LEAVE drop_capacity_checks;
    END IF;

    SET @stage10j_drop_check_sql = CONCAT(
      'ALTER TABLE `', REPLACE(target_table_name, '`', '``'),
      '` DROP CHECK `', REPLACE(existing_constraint_name, '`', '``'), '`'
    );
    PREPARE stage10j_drop_check_statement FROM @stage10j_drop_check_sql;
    EXECUTE stage10j_drop_check_statement;
    DEALLOCATE PREPARE stage10j_drop_check_statement;
  END LOOP;

  CLOSE capacity_check_cursor;

  SET @stage10j_add_check_sql = CONCAT(
    'ALTER TABLE `', REPLACE(target_table_name, '`', '``'),
    '` ADD CONSTRAINT `', REPLACE(target_constraint_name, '`', '``'),
    '` CHECK (`', REPLACE(target_column_name, '`', '``'),
    '` IS NULL OR `', REPLACE(target_column_name, '`', '``'), '` >= 0)'
  );
  PREPARE stage10j_add_check_statement FROM @stage10j_add_check_sql;
  EXECUTE stage10j_add_check_statement;
  DEALLOCATE PREPARE stage10j_add_check_statement;
END//

CREATE PROCEDURE stage10j_allow_null_memory_install_type(
  IN target_table_name VARCHAR(64)
)
BEGIN
  DECLARE column_type_value VARCHAR(255) DEFAULT NULL;

  SELECT COLUMN_TYPE INTO column_type_value
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = target_table_name
    AND COLUMN_NAME = 'memory_install_type_code'
  LIMIT 1;

  IF column_type_value IS NULL OR column_type_value = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10J requires memory_install_type_code on both memory tables.';
  END IF;

  SET @stage10j_nullable_install_sql = CONCAT(
    'ALTER TABLE `', REPLACE(target_table_name, '`', '``'),
    '` MODIFY COLUMN `memory_install_type_code` ', column_type_value,
    ' NULL DEFAULT NULL'
  );
  PREPARE stage10j_nullable_install_statement FROM @stage10j_nullable_install_sql;
  EXECUTE stage10j_nullable_install_statement;
  DEALLOCATE PREPARE stage10j_nullable_install_statement;
END//
DELIMITER ;

CALL stage10j_replace_capacity_check('units', 'previous_ram_gb', 'chk_units_previous_ram_gb');
CALL stage10j_replace_capacity_check('units', 'ram_gb', 'chk_units_ram_gb');
CALL stage10j_replace_capacity_check('units', 'previous_storage_gb', 'chk_units_previous_storage_gb');
CALL stage10j_replace_capacity_check('units', 'storage_gb', 'chk_units_storage_gb');
CALL stage10j_replace_capacity_check('unit_memory_modules', 'size_gb', 'chk_unit_memory_modules_size');
CALL stage10j_replace_capacity_check('unit_storage_devices', 'size_gb', 'chk_unit_storage_devices_size');
CALL stage10j_replace_capacity_check('unit_previous_memory_modules', 'size_gb', 'chk_unit_previous_memory_modules_size');
CALL stage10j_replace_capacity_check('unit_previous_storage_devices', 'size_gb', 'chk_unit_previous_storage_devices_size');

CALL stage10j_allow_null_memory_install_type('unit_memory_modules');
CALL stage10j_allow_null_memory_install_type('unit_previous_memory_modules');

DROP PROCEDURE stage10j_allow_null_memory_install_type;
DROP PROCEDURE stage10j_replace_capacity_check;
