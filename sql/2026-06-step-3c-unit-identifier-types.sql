/*
  Step 3c - Unit Identifier Types

  Purpose:
  - Add config values needed by unit_identifiers.
  - Backfill numeric asset identifiers for existing units.
  - Keep the prefix outside the database. The database stores the numeric asset number.
*/

START TRANSACTION;

INSERT INTO config_categories (code, name, description, is_active)
VALUES
  ('unit_identifier_types', 'Unit Identifier Types', 'Identifier types used to match units and prevent duplicate records.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @identifier_category_id = (
  SELECT config_category_id
  FROM config_categories
  WHERE code = 'unit_identifier_types'
  LIMIT 1
);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@identifier_category_id, 'asset_tag', 'Asset Tag', 'asset_tag', NULL, 10, 1),
  (@identifier_category_id, 'unit_serial_number', 'Unit Serial Number', 'unit_serial_number', NULL, 20, 1),
  (@identifier_category_id, 'bios_serial_number', 'BIOS Serial Number', 'bios_serial_number', NULL, 30, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @asset_identifier_type_id = (
  SELECT cv.config_value_id
  FROM config_values cv
  JOIN config_categories cc
    ON cc.config_category_id = cv.config_category_id
  WHERE cc.code = 'unit_identifier_types'
    AND cv.code = 'asset_tag'
  LIMIT 1
);

INSERT INTO unit_identifiers (
  unit_id,
  identifier_type_config_value_id,
  identifier_value,
  normalized_value,
  is_primary
)
SELECT
  u.unit_id,
  @asset_identifier_type_id,
  CAST(u.asset_number AS CHAR),
  CAST(u.asset_number AS CHAR),
  1
FROM units u
WHERE @asset_identifier_type_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  unit_id = VALUES(unit_id),
  identifier_value = VALUES(identifier_value),
  normalized_value = VALUES(normalized_value),
  is_primary = VALUES(is_primary);

COMMIT;