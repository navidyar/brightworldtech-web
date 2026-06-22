/*
  Step 6f.1 — Closed Lot Lifecycle

  Open and Closed are operational lot states.
  Hidden remains a separate administrative visibility setting.
*/

SET @database_name = DATABASE();

/* Add the reversible operational closed state. */
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'lots'
    AND COLUMN_NAME = 'is_closed'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE lots ADD COLUMN is_closed TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active',
  'SELECT ''lots.is_closed already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

UPDATE lots
SET is_closed = 0
WHERE is_closed IS NULL;

/* Supports open-lot destination lookups without changing hidden-lot behavior. */
SET @index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'lots'
    AND INDEX_NAME = 'idx_lots_operational_state'
);
SET @sql = IF(
  @index_exists = 0,
  'ALTER TABLE lots ADD INDEX idx_lots_operational_state (is_active, is_closed)',
  'SELECT ''idx_lots_operational_state already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SELECT 'Step 6f.1 closed-lot lifecycle migration complete' AS message;
