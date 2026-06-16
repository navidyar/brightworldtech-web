-- Step 5b: Lot visibility / hidden lots foundation.
-- This keeps old lots in history while allowing Management to hide them from normal lot browsers and dropdowns.

SET @lots_has_is_active = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lots'
    AND COLUMN_NAME = 'is_active'
);

SET @add_lots_is_active_sql = IF(
  @lots_has_is_active = 0,
  'ALTER TABLE lots ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);

PREPARE add_lots_is_active_stmt FROM @add_lots_is_active_sql;
EXECUTE add_lots_is_active_stmt;
DEALLOCATE PREPARE add_lots_is_active_stmt;

UPDATE lots
SET is_active = 1
WHERE is_active IS NULL;
