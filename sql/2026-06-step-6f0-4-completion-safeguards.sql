-- Step 6f.0.4
-- Preserve existing completion history while preventing a new duplicate manual credit
-- for the same unit's current lot stay.

SET @database_name = DATABASE();

SET @work_cycle_key_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'unit_work_completions'
    AND COLUMN_NAME = 'work_cycle_key'
);
SET @work_cycle_key_column_sql = IF(
  @work_cycle_key_column_exists = 0,
  'ALTER TABLE unit_work_completions ADD COLUMN work_cycle_key VARCHAR(191) NULL AFTER credit_source',
  'SELECT ''unit_work_completions.work_cycle_key already exists'' AS message'
);
PREPARE work_cycle_key_column_statement FROM @work_cycle_key_column_sql;
EXECUTE work_cycle_key_column_statement;
DEALLOCATE PREPARE work_cycle_key_column_statement;

UPDATE unit_work_completions
SET work_cycle_key = CONCAT('legacy:', unit_work_completion_id)
WHERE credit_source = 'manual_completion'
  AND work_cycle_key IS NULL;

SET @work_cycle_key_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'unit_work_completions'
    AND INDEX_NAME = 'uniq_unit_work_completions_cycle'
);
SET @work_cycle_key_index_sql = IF(
  @work_cycle_key_index_exists = 0,
  'ALTER TABLE unit_work_completions ADD UNIQUE INDEX uniq_unit_work_completions_cycle (work_cycle_key)',
  'SELECT ''uniq_unit_work_completions_cycle already exists'' AS message'
);
PREPARE work_cycle_key_index_statement FROM @work_cycle_key_index_sql;
EXECUTE work_cycle_key_index_statement;
DEALLOCATE PREPARE work_cycle_key_index_statement;

SELECT 'Step 6f.0.4 completion safeguards migration complete' AS message;
