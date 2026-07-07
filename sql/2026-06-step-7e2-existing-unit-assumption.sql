-- Step 7e.2: Controlled Existing Unit Assumption
-- Adds a Management-controlled lot setting. The setting defaults to disabled for every
-- existing lot, so Management must intentionally enable it on the work lots where a
-- regular Tech may assume a matching unit during Create Unit intake.

SET @step7e2_schema = DATABASE();
SET @step7e2_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @step7e2_schema
    AND TABLE_NAME = 'lots'
    AND COLUMN_NAME = 'allow_duplicate_unit_assumption'
);

SET @step7e2_sql = IF(
  @step7e2_column_exists = 0,
  'ALTER TABLE lots ADD COLUMN allow_duplicate_unit_assumption TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''lots.allow_duplicate_unit_assumption already exists'' AS message'
);

PREPARE step7e2_statement FROM @step7e2_sql;
EXECUTE step7e2_statement;
DEALLOCATE PREPARE step7e2_statement;

SELECT 'Step 7e.2 existing unit assumption migration complete' AS message;
