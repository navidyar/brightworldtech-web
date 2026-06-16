/*
  Step 5a hotfix — Production Weight Types values

  Purpose:
  - Ensure Production Weight Types has visible values even when config_values.code is globally unique.
  - Use globally unique codes so these records do not collide with existing unit category values like laptop/desktop/mac.
  - Keep support-task productivity out of scope.
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
  config_category_id = VALUES(config_category_id),
  label = VALUES(label),
  value = VALUES(value),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

COMMIT;

SELECT
  'Step 5a production weight values hotfix complete' AS message,
  COUNT(*) AS production_weight_type_count
FROM config_values
WHERE config_category_id = @production_weight_category_id
  AND code LIKE 'production_weight_%';
