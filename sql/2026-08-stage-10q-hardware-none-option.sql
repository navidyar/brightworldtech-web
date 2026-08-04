-- Stage 10Q: Explicit None option for Hardware Issues
-- Adds or reactivates one semantic None value in the Hardware Issue Type category.
-- Existing issue records are not changed.

SET @stage10q_hardware_issue_category_id = (
  SELECT cc.config_category_id
  FROM config_categories cc
  WHERE cc.code IN ('hardware_issue_types', 'hardware_issue_type', 'hardware_issues')
  ORDER BY FIELD(cc.code, 'hardware_issue_types', 'hardware_issue_type', 'hardware_issues'), cc.config_category_id
  LIMIT 1
);

SET @stage10q_hardware_none_id = (
  SELECT cv.config_value_id
  FROM config_values cv
  WHERE cv.config_category_id = @stage10q_hardware_issue_category_id
    AND (
      LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.code, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
        'none',
        'no_issue',
        'no_issues',
        'hardware_none',
        'hardware_issue_none',
        'no_hardware_issue',
        'no_hardware_issues'
      )
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.label, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
        'none',
        'no_issue',
        'no_issues',
        'hardware_none',
        'hardware_issue_none',
        'no_hardware_issue',
        'no_hardware_issues'
      )
      OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.value, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
        'none',
        'no_issue',
        'no_issues',
        'hardware_none',
        'hardware_issue_none',
        'no_hardware_issue',
        'no_hardware_issues'
      )
    )
  ORDER BY
    CASE WHEN COALESCE(cv.is_active, 1) = 1 THEN 0 ELSE 1 END,
    cv.sort_order,
    cv.config_value_id
  LIMIT 1
);

UPDATE config_values
SET label = 'None',
    value = COALESCE(NULLIF(TRIM(value), ''), 'no_hardware_issue'),
    is_active = 1
WHERE config_value_id = @stage10q_hardware_none_id;

INSERT INTO config_values (
  config_category_id,
  code,
  label,
  value,
  sort_order,
  is_active
)
SELECT
  @stage10q_hardware_issue_category_id,
  'hardware_issue_none',
  'None',
  'no_hardware_issue',
  0,
  1
WHERE @stage10q_hardware_issue_category_id IS NOT NULL
  AND @stage10q_hardware_none_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM config_values existing
    WHERE existing.code = 'hardware_issue_none'
  );
