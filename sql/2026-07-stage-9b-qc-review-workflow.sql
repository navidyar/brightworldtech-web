UPDATE roles
SET
  name = 'Quality Control',
  description = 'Cross-technician Unit review access. Quality Control can accept or reject completed Units and record review notes without receiving production, approval, lifecycle, deletion, or request-review authority.',
  is_active = 1
WHERE code = 'qc';

DROP PROCEDURE IF EXISTS apply_stage_9b_qc_review_storage;

DELIMITER //
CREATE PROCEDURE apply_stage_9b_qc_review_storage()
BEGIN
  DECLARE unit_id_type VARCHAR(64) DEFAULT NULL;
  DECLARE completion_id_type VARCHAR(64) DEFAULT NULL;
  DECLARE reviewer_id_type VARCHAR(64) DEFAULT NULL;
  DECLARE unit_id_data_type VARCHAR(64) DEFAULT NULL;
  DECLARE completion_id_data_type VARCHAR(64) DEFAULT NULL;
  DECLARE reviewer_id_data_type VARCHAR(64) DEFAULT NULL;

  SELECT COLUMN_TYPE, DATA_TYPE
  INTO unit_id_type, unit_id_data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'unit_id'
  LIMIT 1;

  SELECT COLUMN_TYPE, DATA_TYPE
  INTO completion_id_type, completion_id_data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_work_completions'
    AND COLUMN_NAME = 'unit_work_completion_id'
  LIMIT 1;

  SELECT COLUMN_TYPE, DATA_TYPE
  INTO reviewer_id_type, reviewer_id_data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'user_id'
  LIMIT 1;

  IF unit_id_type IS NULL
     OR completion_id_type IS NULL
     OR reviewer_id_type IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 9B could not resolve one or more referenced ID column types.';
  END IF;

  IF unit_id_data_type NOT IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint')
     OR completion_id_data_type NOT IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint')
     OR reviewer_id_data_type NOT IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 9B requires integer-compatible referenced ID columns.';
  END IF;

  SET @stage_9b_create_qc_storage = CONCAT(
    'CREATE TABLE IF NOT EXISTS unit_qc_checks (',
    'unit_qc_check_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,',
    'unit_id ', unit_id_type, ' NOT NULL,',
    'unit_work_completion_id ', completion_id_type, ' NOT NULL,',
    'reviewed_by_user_id ', reviewer_id_type, ' NOT NULL,',
    'decision_code VARCHAR(20) NOT NULL,',
    'review_notes VARCHAR(2000) NULL,',
    'reviewed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
    'PRIMARY KEY (unit_qc_check_id),',
    'KEY idx_unit_qc_checks_unit_latest (unit_id, unit_qc_check_id),',
    'KEY idx_unit_qc_checks_completion_latest (unit_work_completion_id, unit_qc_check_id),',
    'KEY idx_unit_qc_checks_reviewer_time (reviewed_by_user_id, reviewed_at),',
    'KEY idx_unit_qc_checks_decision_time (decision_code, reviewed_at),',
    'CONSTRAINT fk_unit_qc_checks_unit ',
      'FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,',
    'CONSTRAINT fk_unit_qc_checks_completion ',
      'FOREIGN KEY (unit_work_completion_id) REFERENCES unit_work_completions (unit_work_completion_id) ON DELETE CASCADE,',
    'CONSTRAINT fk_unit_qc_checks_reviewer ',
      'FOREIGN KEY (reviewed_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT,',
    'CONSTRAINT chk_unit_qc_checks_decision ',
      'CHECK (decision_code IN (''accepted'', ''rejected'')),',
    'CONSTRAINT chk_unit_qc_checks_rejection_notes ',
      'CHECK (decision_code <> ''rejected'' OR CHAR_LENGTH(TRIM(COALESCE(review_notes, ''''))) > 0)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci'
  );

  PREPARE stage_9b_statement FROM @stage_9b_create_qc_storage;
  EXECUTE stage_9b_statement;
  DEALLOCATE PREPARE stage_9b_statement;
END//
DELIMITER ;

CALL apply_stage_9b_qc_review_storage();
DROP PROCEDURE apply_stage_9b_qc_review_storage;
