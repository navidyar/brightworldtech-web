DROP PROCEDURE IF EXISTS apply_stage_10w_operational_option_ranking_administration;

DELIMITER //
CREATE PROCEDURE apply_stage_10w_operational_option_ranking_administration()
BEGIN
  DECLARE table_count INT DEFAULT 0;
  DECLARE column_count INT DEFAULT 0;
  DECLARE compatible_column_count INT DEFAULT 0;
  DECLARE constraint_count INT DEFAULT 0;

  SELECT COUNT(*) INTO table_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operational_option_usage_refresh_state';

  IF table_count <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10W requires the Stage 10M operational option refresh-state table.';
  END IF;

  SELECT COUNT(*) INTO column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operational_option_usage_refresh_state'
    AND COLUMN_NAME = 'refresh_interval_minutes';

  IF column_count = 0 THEN
    ALTER TABLE operational_option_usage_refresh_state
      ADD COLUMN refresh_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120
      AFTER refresh_key;
  ELSE
    SELECT COUNT(*) INTO compatible_column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_refresh_state'
      AND COLUMN_NAME = 'refresh_interval_minutes'
      AND DATA_TYPE IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint');

    IF compatible_column_count <> 1 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Existing refresh_interval_minutes column is incompatible; refusing destructive replacement.';
    END IF;
  END IF;

  UPDATE operational_option_usage_refresh_state
  SET refresh_interval_minutes = 120
  WHERE refresh_interval_minutes NOT IN (60, 120, 360, 1440)
     OR refresh_interval_minutes IS NULL;

  ALTER TABLE operational_option_usage_refresh_state
    MODIFY COLUMN refresh_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120
    AFTER refresh_key;

  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operational_option_usage_refresh_state'
    AND CONSTRAINT_TYPE = 'CHECK'
    AND CONSTRAINT_NAME = 'chk_operational_option_refresh_interval';

  IF constraint_count = 1 THEN
    ALTER TABLE operational_option_usage_refresh_state
      DROP CHECK chk_operational_option_refresh_interval;
  END IF;

  ALTER TABLE operational_option_usage_refresh_state
    ADD CONSTRAINT chk_operational_option_refresh_interval
    CHECK (refresh_interval_minutes IN (60, 120, 360, 1440));

  INSERT INTO operational_option_usage_refresh_state (
    refresh_key,
    refresh_interval_minutes,
    status,
    started_at,
    completed_at,
    duration_ms,
    ranking_row_count,
    last_error
  )
  VALUES ('operational_options', 120, 'idle', NULL, NULL, NULL, 0, NULL)
  ON DUPLICATE KEY UPDATE refresh_key = VALUES(refresh_key);
END//
DELIMITER ;

CALL apply_stage_10w_operational_option_ranking_administration();
DROP PROCEDURE apply_stage_10w_operational_option_ranking_administration;
