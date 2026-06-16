/*
  Step 5a — Configurable Production Weight Foundation

  Purpose:
  - Add configurable default production weights without building support-task productivity.
  - Seed agreed starter weights in config values.
  - Add lot-level default production weight fields.
  - Add unit-level override fields for future Management / Tech Lead override controls.
  - Keep production weight separate from Pass/Fail and Cosmetic Grade.
*/

START TRANSACTION;

INSERT INTO config_categories (code, name, description, is_active)
VALUES
  ('production_weight_types', 'Production Weight Types', 'Default production credit weights by unit category or configured work type. These values are separate from Pass/Fail and Cosmetic Grade.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @production_weight_category_id = (
  SELECT config_category_id
  FROM config_categories
  WHERE code = 'production_weight_types'
  LIMIT 1
);

INSERT INTO config_values (config_category_id, code, label, value, sort_order, is_active)
VALUES
  (@production_weight_category_id, 'production_weight_laptop', 'Laptop', '1.00', 10, 1),
  (@production_weight_category_id, 'production_weight_desktop', 'Desktop', '0.50', 20, 1),
  (@production_weight_category_id, 'production_weight_mac', 'Mac', '3.00', 30, 1),
  (@production_weight_category_id, 'production_weight_windows_surface', 'Windows Surface', '2.00', 40, 1),
  (@production_weight_category_id, 'production_weight_els', 'ELS', '0.33', 50, 1),
  (@production_weight_category_id, 'production_weight_configuration_task', 'Configuration Task', '0.33', 60, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @database_name = DATABASE();

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'lots'
    AND COLUMN_NAME = 'default_production_weight_config_value_id'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE lots ADD COLUMN default_production_weight_config_value_id BIGINT UNSIGNED NULL',
  'SELECT ''lots.default_production_weight_config_value_id already exists'' AS message'
);

PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'lots'
    AND COLUMN_NAME = 'default_production_weight'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE lots ADD COLUMN default_production_weight DECIMAL(8,2) NULL',
  'SELECT ''lots.default_production_weight already exists'' AS message'
);

PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'production_weight_override'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN production_weight_override DECIMAL(8,2) NULL',
  'SELECT ''units.production_weight_override already exists'' AS message'
);

PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'production_weight_notes'
);

SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN production_weight_notes VARCHAR(500) NULL',
  'SELECT ''units.production_weight_notes already exists'' AS message'
);

PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

COMMIT;

SELECT
  'Step 5a production weight foundation migration complete' AS message,
  COUNT(*) AS production_weight_type_count
FROM config_values
WHERE config_category_id = @production_weight_category_id;
