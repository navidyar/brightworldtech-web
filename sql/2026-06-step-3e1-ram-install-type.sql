/*
  Step 3e.1 — RAM Install Type

  Adds a per-RAM-row install type so the app can distinguish removable RAM modules
  from integrated/soldered RAM. Existing RAM rows are treated as removable modules
  by default because that is the normal tech-edit workflow.
*/

SET @database_name = DATABASE();
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'unit_memory_modules'
    AND COLUMN_NAME = 'memory_install_type_code'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE unit_memory_modules ADD COLUMN memory_install_type_code VARCHAR(50) NOT NULL DEFAULT ''removable_module'' AFTER ram_type_config_value_id',
  'SELECT ''unit_memory_modules.memory_install_type_code already exists'' AS message'
);

PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

UPDATE unit_memory_modules
SET memory_install_type_code = 'removable_module'
WHERE memory_install_type_code IS NULL
   OR memory_install_type_code = '';

SELECT
  'Step 3e.1 RAM install type migration complete' AS message,
  COUNT(*) AS memory_module_rows
FROM unit_memory_modules;
