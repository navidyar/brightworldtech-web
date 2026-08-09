START TRANSACTION;

SET @stage10w1_lot_requirement_type_category_id = (
  SELECT config_category_id
  FROM config_categories
  WHERE code = 'lot_requirement_types'
  LIMIT 1
);

INSERT INTO config_values (
  config_category_id,
  code,
  label,
  value,
  sort_order,
  is_active
)
SELECT
  @stage10w1_lot_requirement_type_category_id,
  'battery_health',
  'Battery Health',
  'battery_health',
  85,
  1
WHERE @stage10w1_lot_requirement_type_category_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  sort_order = VALUES(sort_order),
  is_active = 1;

COMMIT;
