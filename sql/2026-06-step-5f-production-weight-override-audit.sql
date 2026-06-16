/*
  Step 5f — Production Weight Application Cleanup

  Purpose:
  - Keep production weight separate from Cosmetic Grade and Unit Pass/Fail.
  - Add optional audit fields for unit-level production weight overrides.
  - Do not add support-task productivity records or full productivity reporting.
*/

START TRANSACTION;

SET @database_name = DATABASE();

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'production_weight_override_updated_by_user_id'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN production_weight_override_updated_by_user_id BIGINT UNSIGNED NULL',
  'SELECT ''units.production_weight_override_updated_by_user_id already exists'' AS message'
);

PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'production_weight_override_updated_at'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN production_weight_override_updated_at DATETIME NULL',
  'SELECT ''units.production_weight_override_updated_at already exists'' AS message'
);

PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

COMMIT;

SELECT 'Step 5f production weight override audit migration complete' AS message;
