-- Step 7e.1: Normalize existing Unit and BIOS serial display values to uppercase.
-- Comparison values remain punctuation-insensitive and case-insensitive.

UPDATE unit_identifiers ui
JOIN config_values cv
  ON cv.config_value_id = ui.identifier_type_config_value_id
JOIN config_categories cc
  ON cc.config_category_id = cv.config_category_id
SET
  ui.identifier_value = UPPER(ui.identifier_value),
  ui.normalized_value = UPPER(REGEXP_REPLACE(ui.identifier_value, '[^A-Za-z0-9]+', ''))
WHERE cc.code = 'unit_identifier_types'
  AND cv.code IN ('unit_serial_number', 'bios_serial_number');

SELECT 'Step 7e.1 identifier intake controls migration complete' AS message;
