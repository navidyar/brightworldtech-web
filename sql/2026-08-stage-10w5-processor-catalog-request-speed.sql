DROP PROCEDURE IF EXISTS apply_stage_10w5_processor_catalog_request_speed;

DELIMITER //
CREATE PROCEDURE apply_stage_10w5_processor_catalog_request_speed()
BEGIN
  DECLARE table_count INT DEFAULT 0;
  DECLARE column_count INT DEFAULT 0;
  DECLARE compatible_column_count INT DEFAULT 0;
  DECLARE constraint_count INT DEFAULT 0;

  SELECT COUNT(*) INTO table_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_processor_catalog_requests';

  IF table_count <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10W.5 requires the existing unit_processor_catalog_requests table.';
  END IF;

  SELECT COUNT(*) INTO column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_processor_catalog_requests'
    AND COLUMN_NAME = 'requested_processor_speed_ghz';

  IF column_count = 0 THEN
    ALTER TABLE unit_processor_catalog_requests
      ADD COLUMN requested_processor_speed_ghz DECIMAL(5,2) NULL
      AFTER requested_processor_name;
  ELSE
    SELECT COUNT(*) INTO compatible_column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_processor_catalog_requests'
      AND COLUMN_NAME = 'requested_processor_speed_ghz'
      AND DATA_TYPE = 'decimal'
      AND NUMERIC_PRECISION = 5
      AND NUMERIC_SCALE = 2
      AND IS_NULLABLE = 'YES';

    IF compatible_column_count <> 1 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Existing requested_processor_speed_ghz column is incompatible; refusing destructive replacement.';
    END IF;
  END IF;

  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_processor_catalog_requests'
    AND CONSTRAINT_TYPE = 'CHECK'
    AND CONSTRAINT_NAME = 'chk_unit_processor_catalog_requested_speed';

  IF constraint_count = 0 THEN
    ALTER TABLE unit_processor_catalog_requests
      ADD CONSTRAINT chk_unit_processor_catalog_requested_speed
      CHECK (
        requested_processor_speed_ghz IS NULL
        OR (requested_processor_speed_ghz >= 0.01 AND requested_processor_speed_ghz <= 99.99)
      );
  END IF;
END//
DELIMITER ;

CALL apply_stage_10w5_processor_catalog_request_speed();
DROP PROCEDURE apply_stage_10w5_processor_catalog_request_speed;
