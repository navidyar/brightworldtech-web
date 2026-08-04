DROP PROCEDURE IF EXISTS apply_stage_9g_qc_correction_storage;

DELIMITER //
CREATE PROCEDURE apply_stage_9g_qc_correction_storage()
BEGIN
  DECLARE unit_id_type VARCHAR(64) DEFAULT NULL;
  DECLARE completion_id_type VARCHAR(64) DEFAULT NULL;
  DECLARE qc_check_id_type VARCHAR(64) DEFAULT NULL;
  DECLARE submitter_id_type VARCHAR(64) DEFAULT NULL;
  DECLARE unit_id_data_type VARCHAR(64) DEFAULT NULL;
  DECLARE completion_id_data_type VARCHAR(64) DEFAULT NULL;
  DECLARE qc_check_id_data_type VARCHAR(64) DEFAULT NULL;
  DECLARE submitter_id_data_type VARCHAR(64) DEFAULT NULL;

  SELECT COLUMN_TYPE, DATA_TYPE INTO unit_id_type, unit_id_data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units' AND COLUMN_NAME = 'unit_id'
  LIMIT 1;

  SELECT COLUMN_TYPE, DATA_TYPE INTO completion_id_type, completion_id_data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_work_completions' AND COLUMN_NAME = 'unit_work_completion_id'
  LIMIT 1;

  SELECT COLUMN_TYPE, DATA_TYPE INTO qc_check_id_type, qc_check_id_data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks' AND COLUMN_NAME = 'unit_qc_check_id'
  LIMIT 1;

  SELECT COLUMN_TYPE, DATA_TYPE INTO submitter_id_type, submitter_id_data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'user_id'
  LIMIT 1;

  IF unit_id_type IS NULL OR completion_id_type IS NULL OR qc_check_id_type IS NULL OR submitter_id_type IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 9G could not resolve one or more referenced ID column types.';
  END IF;

  IF unit_id_data_type NOT IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint')
     OR completion_id_data_type NOT IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint')
     OR qc_check_id_data_type NOT IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint')
     OR submitter_id_data_type NOT IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 9G requires integer-compatible referenced ID columns.';
  END IF;

  SET @stage_9g_create_qc_corrections = CONCAT(
    'CREATE TABLE IF NOT EXISTS unit_qc_corrections (',
    'unit_qc_correction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,',
    'unit_id ', unit_id_type, ' NOT NULL,',
    'unit_work_completion_id ', completion_id_type, ' NOT NULL,',
    'rejected_qc_check_id ', qc_check_id_type, ' NOT NULL,',
    'submitted_by_user_id ', submitter_id_type, ' NOT NULL,',
    'correction_notes VARCHAR(2000) NULL,',
    'submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
    'PRIMARY KEY (unit_qc_correction_id),',
    'UNIQUE KEY uq_unit_qc_corrections_rejection (rejected_qc_check_id),',
    'KEY idx_unit_qc_corrections_unit_latest (unit_id, unit_qc_correction_id),',
    'KEY idx_unit_qc_corrections_completion_latest (unit_work_completion_id, unit_qc_correction_id),',
    'KEY idx_unit_qc_corrections_submitter_time (submitted_by_user_id, submitted_at),',
    'CONSTRAINT fk_unit_qc_corrections_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,',
    'CONSTRAINT fk_unit_qc_corrections_completion FOREIGN KEY (unit_work_completion_id) REFERENCES unit_work_completions (unit_work_completion_id) ON DELETE CASCADE,',
    'CONSTRAINT fk_unit_qc_corrections_rejection FOREIGN KEY (rejected_qc_check_id) REFERENCES unit_qc_checks (unit_qc_check_id) ON DELETE CASCADE,',
    'CONSTRAINT fk_unit_qc_corrections_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci'
  );

  PREPARE stage_9g_statement FROM @stage_9g_create_qc_corrections;
  EXECUTE stage_9g_statement;
  DEALLOCATE PREPARE stage_9g_statement;
END//
DELIMITER ;

CALL apply_stage_9g_qc_correction_storage();
DROP PROCEDURE apply_stage_9g_qc_correction_storage;
