-- Step 7h: Unit Request Ordering & Retention
-- Keeps active queue views focused on current work. Resolved requests are retained
-- indefinitely and receive an archive timestamp after the application retention pass.

SET @has_unit_requests_archived_at := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_requests'
    AND COLUMN_NAME = 'archived_at'
);

SET @sql := IF(
  @has_unit_requests_archived_at = 0,
  'ALTER TABLE unit_requests ADD COLUMN archived_at DATETIME NULL AFTER reviewed_at',
  'SELECT ''unit_requests.archived_at already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_unit_requests_archive_retention_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_requests'
    AND INDEX_NAME = 'idx_unit_requests_archive_retention'
);

SET @sql := IF(
  @has_unit_requests_archive_retention_index = 0,
  'ALTER TABLE unit_requests ADD KEY idx_unit_requests_archive_retention (archived_at, status, reviewed_at)',
  'SELECT ''idx_unit_requests_archive_retention already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Step 7h Unit Request ordering and retention migration complete' AS message;
