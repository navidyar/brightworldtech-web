CREATE TABLE IF NOT EXISTS unit_issue_entries (
  unit_issue_entry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_id BIGINT UNSIGNED NOT NULL,
  issue_area VARCHAR(30) NOT NULL,
  issue_type_config_value_id BIGINT UNSIGNED NULL,
  custom_issue_label VARCHAR(120) NULL,
  severity_config_value_id BIGINT UNSIGNED NULL,
  location_config_value_id BIGINT UNSIGNED NULL,
  issue_remark VARCHAR(500) NULL,
  source_code VARCHAR(50) NOT NULL DEFAULT 'manual',
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id BIGINT UNSIGNED NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (unit_issue_entry_id),
  KEY idx_unit_issue_entries_unit_area_current (unit_id, issue_area, is_current),
  KEY idx_unit_issue_entries_issue_type (issue_type_config_value_id),
  KEY idx_unit_issue_entries_location (location_config_value_id),
  KEY idx_unit_issue_entries_severity (severity_config_value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS unit_comments (
  unit_comment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_id BIGINT UNSIGNED NOT NULL,
  note_type_config_value_id BIGINT UNSIGNED NULL,
  comment_text TEXT NOT NULL,
  source_code VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (unit_comment_id),
  KEY idx_unit_comments_unit_created (unit_id, created_at),
  KEY idx_unit_comments_note_type (note_type_config_value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO config_categories (code, name, description, is_active)
VALUES
  ('cosmetic_issue_types', 'Cosmetic Issue Types', 'Selectable cosmetic issue types for unit grading and remarks.', 1),
  ('hardware_issue_types', 'Hardware Issue Types', 'Selectable hardware issue types for unit diagnostics and remarks.', 1),
  ('issue_locations', 'Issue Locations', 'Selectable physical locations for cosmetic and hardware issues.', 1),
  ('issue_severities', 'Issue Severities', 'Selectable severity values for cosmetic issues.', 1),
  ('unit_comment_types', 'Unit Comment Types', 'Selectable comment categories for unit comment history.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = VALUES(is_active);

INSERT INTO config_values (config_category_id, code, label, value, sort_order, is_active)
SELECT cc.config_category_id, seed.code, seed.label, seed.value, seed.sort_order, 1
FROM config_categories cc
JOIN (
  SELECT 'cosmetic_issue_types' AS category_code, 'paint_peeling' AS code, 'Paint Peeling' AS label, 'paint_peeling' AS value, 10 AS sort_order
  UNION ALL SELECT 'cosmetic_issue_types', 'chassis_dents', 'Chassis Dents', 'chassis_dents', 20
  UNION ALL SELECT 'cosmetic_issue_types', 'chassis_cracks', 'Chassis Cracks', 'chassis_cracks', 30
  UNION ALL SELECT 'cosmetic_issue_types', 'chassis_scratches', 'Chassis Scratches', 'chassis_scratches', 40
  UNION ALL SELECT 'cosmetic_issue_types', 'chassis_scuffing', 'Chassis Scuffing', 'chassis_scuffing', 50
  UNION ALL SELECT 'cosmetic_issue_types', 'lcd_scratches', 'LCD Scratches', 'lcd_scratches', 60
  UNION ALL SELECT 'cosmetic_issue_types', 'lcd_scuffing', 'LCD Scuffing', 'lcd_scuffing', 70
  UNION ALL SELECT 'cosmetic_issue_types', 'lcd_cracking', 'LCD Cracking', 'lcd_cracking', 80
  UNION ALL SELECT 'cosmetic_issue_types', 'none', 'None', 'none', 999

  UNION ALL SELECT 'hardware_issue_types', 'camera_not_working', 'Camera Not Working', 'camera_not_working', 10
  UNION ALL SELECT 'hardware_issue_types', 'mic_not_working', 'Microphone Not Working', 'mic_not_working', 20
  UNION ALL SELECT 'hardware_issue_types', 'cannot_install_os', 'Cannot Install OS', 'cannot_install_os', 30
  UNION ALL SELECT 'hardware_issue_types', 'battery_issue', 'Battery Issue', 'battery_issue', 40
  UNION ALL SELECT 'hardware_issue_types', 'keyboard_issue', 'Keyboard Issue', 'keyboard_issue', 50
  UNION ALL SELECT 'hardware_issue_types', 'trackpad_issue', 'Trackpad Issue', 'trackpad_issue', 60
  UNION ALL SELECT 'hardware_issue_types', 'port_damage', 'Port Damage', 'port_damage', 70
  UNION ALL SELECT 'hardware_issue_types', 'speaker_issue', 'Speaker Issue', 'speaker_issue', 80
  UNION ALL SELECT 'hardware_issue_types', 'no_power', 'No Power', 'no_power', 90
  UNION ALL SELECT 'hardware_issue_types', 'other', 'Other', 'other', 999

  UNION ALL SELECT 'issue_locations', 'top_lid', 'Top Lid', 'top_lid', 10
  UNION ALL SELECT 'issue_locations', 'palmrest', 'Palmrest', 'palmrest', 20
  UNION ALL SELECT 'issue_locations', 'keyboard', 'Keyboard', 'keyboard', 30
  UNION ALL SELECT 'issue_locations', 'touchpad', 'Touchpad', 'touchpad', 40
  UNION ALL SELECT 'issue_locations', 'lcd', 'LCD / Screen', 'lcd', 50
  UNION ALL SELECT 'issue_locations', 'bezel', 'Bezel', 'bezel', 60
  UNION ALL SELECT 'issue_locations', 'bottom_cover', 'Bottom Cover', 'bottom_cover', 70
  UNION ALL SELECT 'issue_locations', 'left_side', 'Left Side', 'left_side', 80
  UNION ALL SELECT 'issue_locations', 'right_side', 'Right Side', 'right_side', 90
  UNION ALL SELECT 'issue_locations', 'front', 'Front', 'front', 100
  UNION ALL SELECT 'issue_locations', 'back', 'Back', 'back', 110
  UNION ALL SELECT 'issue_locations', 'internal', 'Internal', 'internal', 120
  UNION ALL SELECT 'issue_locations', 'multiple_locations', 'Multiple Locations', 'multiple_locations', 900
  UNION ALL SELECT 'issue_locations', 'unknown', 'Unknown', 'unknown', 999

  UNION ALL SELECT 'issue_severities', 'minor', 'Minor', 'minor', 10
  UNION ALL SELECT 'issue_severities', 'major', 'Major', 'major', 20
  UNION ALL SELECT 'issue_severities', 'n_a', 'N/A', 'n_a', 999

  UNION ALL SELECT 'unit_comment_types', 'general', 'General', 'general', 10
  UNION ALL SELECT 'unit_comment_types', 'hardware', 'Hardware', 'hardware', 20
  UNION ALL SELECT 'unit_comment_types', 'cosmetic', 'Cosmetic', 'cosmetic', 30
  UNION ALL SELECT 'unit_comment_types', 'internal', 'Internal', 'internal', 40
) seed
  ON seed.category_code = cc.code
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);
