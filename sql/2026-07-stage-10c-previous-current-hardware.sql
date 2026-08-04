DROP PROCEDURE IF EXISTS apply_stage_10c_previous_current_hardware;

DELIMITER //
CREATE PROCEDURE apply_stage_10c_previous_current_hardware()
BEGIN
  DECLARE ram_type VARCHAR(255) DEFAULT NULL;
  DECLARE storage_type VARCHAR(255) DEFAULT NULL;
  DECLARE previous_ram_count INT DEFAULT 0;
  DECLARE previous_storage_count INT DEFAULT 0;
  DECLARE previous_ram_check_count INT DEFAULT 0;
  DECLARE previous_storage_check_count INT DEFAULT 0;

  SELECT COLUMN_TYPE INTO ram_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'ram_gb'
  LIMIT 1;

  SELECT COLUMN_TYPE INTO storage_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'storage_gb'
  LIMIT 1;

  IF ram_type IS NULL OR storage_type IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10C requires units.ram_gb and units.storage_gb.';
  END IF;

  SELECT COUNT(*) INTO previous_ram_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'previous_ram_gb';

  IF previous_ram_count = 0 THEN
    SET @stage10c_sql = CONCAT(
      'ALTER TABLE units ADD COLUMN previous_ram_gb ',
      ram_type,
      ' NULL AFTER ram_gb'
    );
  ELSE
    SET @stage10c_sql = CONCAT(
      'ALTER TABLE units MODIFY COLUMN previous_ram_gb ',
      ram_type,
      ' NULL'
    );
  END IF;
  PREPARE stage10c_statement FROM @stage10c_sql;
  EXECUTE stage10c_statement;
  DEALLOCATE PREPARE stage10c_statement;

  SELECT COUNT(*) INTO previous_storage_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'previous_storage_gb';

  IF previous_storage_count = 0 THEN
    SET @stage10c_sql = CONCAT(
      'ALTER TABLE units ADD COLUMN previous_storage_gb ',
      storage_type,
      ' NULL AFTER storage_gb'
    );
  ELSE
    SET @stage10c_sql = CONCAT(
      'ALTER TABLE units MODIFY COLUMN previous_storage_gb ',
      storage_type,
      ' NULL'
    );
  END IF;
  PREPARE stage10c_statement FROM @stage10c_sql;
  EXECUTE stage10c_statement;
  DEALLOCATE PREPARE stage10c_statement;

  SELECT COUNT(*) INTO previous_ram_check_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND CONSTRAINT_NAME = 'chk_units_previous_ram_gb'
    AND CONSTRAINT_TYPE = 'CHECK';

  IF previous_ram_check_count = 1 THEN
    ALTER TABLE units DROP CHECK chk_units_previous_ram_gb;
  END IF;

  SELECT COUNT(*) INTO previous_storage_check_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND CONSTRAINT_NAME = 'chk_units_previous_storage_gb'
    AND CONSTRAINT_TYPE = 'CHECK';

  IF previous_storage_check_count = 1 THEN
    ALTER TABLE units DROP CHECK chk_units_previous_storage_gb;
  END IF;

  ALTER TABLE units
    ADD CONSTRAINT chk_units_previous_ram_gb
      CHECK (previous_ram_gb IS NULL OR previous_ram_gb >= 0),
    ADD CONSTRAINT chk_units_previous_storage_gb
      CHECK (previous_storage_gb IS NULL OR previous_storage_gb >= 0);
END//
DELIMITER ;

CALL apply_stage_10c_previous_current_hardware();
DROP PROCEDURE apply_stage_10c_previous_current_hardware;
