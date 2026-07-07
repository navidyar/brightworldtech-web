-- Step 7e.2a.1: Keyboard Language Canonicalization
-- Consolidates the duplicate US English / English US choice without deleting historic data.
-- Existing unit specification references move to the retained English US configuration value.

SET @step7e2a_schema = DATABASE();

SET @step7e2a_keyboard_category_id = (
  SELECT cc.config_category_id
  FROM config_categories cc
  WHERE cc.code IN ('keyboard_languages', 'keyboard_language')
  ORDER BY FIELD(cc.code, 'keyboard_languages', 'keyboard_language'), cc.config_category_id
  LIMIT 1
);

-- Prefer a value already identified as English US by code, label, or value.
SET @step7e2a_canonical_id = (
  SELECT cv.config_value_id
  FROM config_values cv
  WHERE cv.config_category_id = @step7e2a_keyboard_category_id
    AND (
      LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.code, '')), ' ', ''), '-', ''), '_', '')) = 'englishus'
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.label, '')), ' ', ''), '-', ''), '_', '')) = 'englishus'
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.value, '')), ' ', ''), '-', ''), '_', '')) = 'englishus'
    )
  ORDER BY
    CASE WHEN LOWER(TRIM(COALESCE(cv.label, ''))) = 'english us' THEN 0 ELSE 1 END,
    CASE WHEN COALESCE(cv.is_active, 1) = 1 THEN 0 ELSE 1 END,
    cv.config_value_id
  LIMIT 1
);

-- Capture the old US English record separately so it can be preserved but retired.
SET @step7e2a_legacy_id = (
  SELECT cv.config_value_id
  FROM config_values cv
  WHERE cv.config_category_id = @step7e2a_keyboard_category_id
    AND (
      LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.code, '')), ' ', ''), '-', ''), '_', '')) = 'usenglish'
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.label, '')), ' ', ''), '-', ''), '_', '')) = 'usenglish'
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.value, '')), ' ', ''), '-', ''), '_', '')) = 'usenglish'
    )
  ORDER BY
    CASE WHEN COALESCE(cv.is_active, 1) = 1 THEN 0 ELSE 1 END,
    cv.config_value_id
  LIMIT 1
);

-- When only US English exists, keep its ID and standardize only its user-facing label.
UPDATE config_values
SET label = 'English US',
    is_active = 1
WHERE config_value_id = @step7e2a_legacy_id
  AND @step7e2a_canonical_id IS NULL;

-- Ensure a canonical row exists when neither spelling was present.
INSERT INTO config_values (config_category_id, code, label, value, sort_order, is_active)
SELECT
  @step7e2a_keyboard_category_id,
  'english_us',
  'English US',
  'english_us',
  COALESCE(MAX(existing.sort_order), 0) + 10,
  1
FROM config_values existing
WHERE existing.config_category_id = @step7e2a_keyboard_category_id
HAVING @step7e2a_keyboard_category_id IS NOT NULL
  AND @step7e2a_canonical_id IS NULL
  AND @step7e2a_legacy_id IS NULL;

SET @step7e2a_english_us_id = (
  SELECT cv.config_value_id
  FROM config_values cv
  WHERE cv.config_category_id = @step7e2a_keyboard_category_id
    AND (
      LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.code, '')), ' ', ''), '-', ''), '_', '')) = 'englishus'
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.label, '')), ' ', ''), '-', ''), '_', '')) = 'englishus'
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.value, '')), ' ', ''), '-', ''), '_', '')) = 'englishus'
    )
  ORDER BY
    CASE WHEN LOWER(TRIM(COALESCE(cv.label, ''))) = 'english us' THEN 0 ELSE 1 END,
    CASE WHEN COALESCE(cv.is_active, 1) = 1 THEN 0 ELSE 1 END,
    cv.config_value_id
  LIMIT 1
);

UPDATE config_values
SET label = 'English US',
    is_active = 1
WHERE config_value_id = @step7e2a_english_us_id;

-- Move historic references before retiring the duplicate record.
SET @step7e2a_unit_specifications_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @step7e2a_schema
    AND TABLE_NAME = 'unit_specifications'
);

SET @step7e2a_repoint_sql = IF(
  @step7e2a_unit_specifications_exists = 1
  AND @step7e2a_english_us_id IS NOT NULL,
  CONCAT(
    'UPDATE unit_specifications us ',
    'INNER JOIN config_values legacy ',
    'ON legacy.config_value_id = us.keyboard_language_config_value_id ',
    'SET us.keyboard_language_config_value_id = ', @step7e2a_english_us_id, ' ',
    'WHERE legacy.config_category_id = ', @step7e2a_keyboard_category_id, ' ',
    'AND legacy.config_value_id <> ', @step7e2a_english_us_id, ' ',
    'AND (',
      'LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(legacy.code, '''')), '' '', ''''), ''-'', ''''), ''_'', '''')) = ''usenglish'' ',
      'OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(legacy.label, '''')), '' '', ''''), ''-'', ''''), ''_'', '''')) = ''usenglish'' ',
      'OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(legacy.value, '''')), '' '', ''''), ''-'', ''''), ''_'', '''')) = ''usenglish''',
    ')'
  ),
  'SELECT ''unit_specifications not present or English US value unavailable; no historical keyboard-language references changed'' AS message'
);

PREPARE step7e2a_repoint_statement FROM @step7e2a_repoint_sql;
EXECUTE step7e2a_repoint_statement;
DEALLOCATE PREPARE step7e2a_repoint_statement;

-- Keep the prior record for audit/history, but remove it from active form options.
UPDATE config_values AS legacy
SET is_active = 0
WHERE legacy.config_category_id = @step7e2a_keyboard_category_id
  AND legacy.config_value_id <> @step7e2a_english_us_id
  AND (
    LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(legacy.code, '')), ' ', ''), '-', ''), '_', '')) = 'usenglish'
    OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(legacy.label, '')), ' ', ''), '-', ''), '_', '')) = 'usenglish'
    OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(legacy.value, '')), ' ', ''), '-', ''), '_', '')) = 'usenglish'
  );

SELECT 'Step 7e.2a.1 lot context and keyboard language migration complete' AS message;
