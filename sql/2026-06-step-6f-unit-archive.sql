/*
  Step 6f — Unit Archive and Retained History

  Purpose:
  - Prevent browser-driven unit deletion.
  - Retain units, identifiers, history, and related detail rows.
  - Hide archived units from the normal unfiltered browser while allowing search retrieval.
*/

SET @database_name = DATABASE();

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'is_archived'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''units.is_archived already exists'' AS message'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'archived_at'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN archived_at DATETIME NULL',
  'SELECT ''units.archived_at already exists'' AS message'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'archived_by_user_id'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN archived_by_user_id INT NULL',
  'SELECT ''units.archived_by_user_id already exists'' AS message'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND INDEX_NAME = 'idx_units_archive_visibility'
);

SET @sql = IF(
  @index_exists = 0,
  'ALTER TABLE units ADD INDEX idx_units_archive_visibility (is_archived, updated_at)',
  'SELECT ''idx_units_archive_visibility already exists'' AS message'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SELECT 'Step 6f unit archive migration complete' AS message;
