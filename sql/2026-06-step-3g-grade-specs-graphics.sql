INSERT INTO config_categories (code, name, description, is_active)
VALUES
  ('overall_unit_grades', 'Overall Unit Grades', 'Overall unit grade values used by techs and sales disposition planning.', 1),
  ('absolute_statuses', 'Absolute Statuses', 'Absolute/Computrace status values.', 1),
  ('physical_camera_statuses', 'Physical Camera Statuses', 'Physical camera test/status values.', 1),
  ('touchscreen_statuses', 'Touchscreen Statuses', 'Touchscreen test/status values.', 1),
  ('keyboard_languages', 'Keyboard Languages', 'Keyboard language/layout values.', 1),
  ('diagnostics_statuses', 'Diagnostics Statuses', 'Complete diagnostics status values.', 1),
  ('virus_check_statuses', 'Virus Check Statuses', 'Virus check status values.', 1),
  ('driver_check_statuses', 'Driver Check Statuses', 'Driver check status values.', 1),
  ('skinned_statuses', 'Skinned Statuses', 'Skinning status values.', 1),
  ('gpu_types', 'GPU Types', 'Graphics adapter type values.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = VALUES(is_active);

INSERT INTO config_values (config_category_id, code, label, value, sort_order, is_active)
SELECT cc.config_category_id, seed.code, seed.label, seed.value, seed.sort_order, 1
FROM config_categories cc
JOIN (
  SELECT 'overall_unit_grades' AS category_code, 'a' AS code, 'A' AS label, 'a' AS value, 10 AS sort_order
  UNION ALL SELECT 'overall_unit_grades', 'b', 'B', 'b', 20
  UNION ALL SELECT 'overall_unit_grades', 'c', 'C', 'c', 30
  UNION ALL SELECT 'overall_unit_grades', 'd', 'D', 'd', 40
  UNION ALL SELECT 'overall_unit_grades', 'n_a', 'N/A', 'n_a', 999

  UNION ALL SELECT 'absolute_statuses', 'enabled', 'Enabled', 'enabled', 10
  UNION ALL SELECT 'absolute_statuses', 'disabled', 'Disabled', 'disabled', 20
  UNION ALL SELECT 'absolute_statuses', 'not_detected', 'Not Detected', 'not_detected', 30
  UNION ALL SELECT 'absolute_statuses', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'physical_camera_statuses', 'working', 'Working', 'working', 10
  UNION ALL SELECT 'physical_camera_statuses', 'not_working', 'Not Working', 'not_working', 20
  UNION ALL SELECT 'physical_camera_statuses', 'not_present', 'Not Present', 'not_present', 30
  UNION ALL SELECT 'physical_camera_statuses', 'not_tested', 'Not Tested', 'not_tested', 40
  UNION ALL SELECT 'physical_camera_statuses', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'touchscreen_statuses', 'working', 'Working', 'working', 10
  UNION ALL SELECT 'touchscreen_statuses', 'not_working', 'Not Working', 'not_working', 20
  UNION ALL SELECT 'touchscreen_statuses', 'not_present', 'Not Present', 'not_present', 30
  UNION ALL SELECT 'touchscreen_statuses', 'not_tested', 'Not Tested', 'not_tested', 40
  UNION ALL SELECT 'touchscreen_statuses', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'keyboard_languages', 'us_english', 'US English', 'us_english', 10
  UNION ALL SELECT 'keyboard_languages', 'english_international', 'English International', 'english_international', 20
  UNION ALL SELECT 'keyboard_languages', 'spanish', 'Spanish', 'spanish', 30
  UNION ALL SELECT 'keyboard_languages', 'french', 'French', 'french', 40
  UNION ALL SELECT 'keyboard_languages', 'german', 'German', 'german', 50
  UNION ALL SELECT 'keyboard_languages', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'diagnostics_statuses', 'passed', 'Passed', 'passed', 10
  UNION ALL SELECT 'diagnostics_statuses', 'failed', 'Failed', 'failed', 20
  UNION ALL SELECT 'diagnostics_statuses', 'partial', 'Partial', 'partial', 30
  UNION ALL SELECT 'diagnostics_statuses', 'not_run', 'Not Run', 'not_run', 40
  UNION ALL SELECT 'diagnostics_statuses', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'virus_check_statuses', 'passed', 'Passed', 'passed', 10
  UNION ALL SELECT 'virus_check_statuses', 'failed', 'Failed', 'failed', 20
  UNION ALL SELECT 'virus_check_statuses', 'not_run', 'Not Run', 'not_run', 30
  UNION ALL SELECT 'virus_check_statuses', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'driver_check_statuses', 'passed', 'Passed', 'passed', 10
  UNION ALL SELECT 'driver_check_statuses', 'failed', 'Failed', 'failed', 20
  UNION ALL SELECT 'driver_check_statuses', 'not_run', 'Not Run', 'not_run', 30
  UNION ALL SELECT 'driver_check_statuses', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'skinned_statuses', 'yes', 'Yes', 'yes', 10
  UNION ALL SELECT 'skinned_statuses', 'no', 'No', 'no', 20
  UNION ALL SELECT 'skinned_statuses', 'not_required', 'Not Required', 'not_required', 30
  UNION ALL SELECT 'skinned_statuses', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'gpu_types', 'integrated', 'Integrated', 'integrated', 10
  UNION ALL SELECT 'gpu_types', 'dedicated', 'Dedicated', 'dedicated', 20
  UNION ALL SELECT 'gpu_types', 'hybrid', 'Hybrid', 'hybrid', 30
  UNION ALL SELECT 'gpu_types', 'unknown', 'Unknown', 'unknown', 999
) seed
  ON seed.category_code = cc.code
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);
