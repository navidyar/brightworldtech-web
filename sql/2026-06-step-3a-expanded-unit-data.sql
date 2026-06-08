/*
  Step 3a - Expanded Unit Data Schema Foundation

  Purpose:
  - Add future-safe tables for detailed unit specs.
  - Preserve current app behavior.
  - Do not remove or rename existing columns.
  - Keep current units.ram_gb/storage_gb columns for now as legacy/simple display fields.
  - Add detailed RAM/storage/GPU/WWAN/component/history tables for future UI and ScanTool API work.
*/

START TRANSACTION;

/*
  ---------------------------------------------------------------------------
  Config category seeds
  ---------------------------------------------------------------------------
*/

INSERT INTO config_categories (code, name, description, is_active)
VALUES
  ('data_sources', 'Data Sources', 'Sources that can create or update unit data.', 1),
  ('tri_state_options', 'Yes / No / N/A Options', 'Reusable yes, no, unknown, and not-applicable values.', 1),
  ('check_statuses', 'Check Statuses', 'Reusable completion/check statuses.', 1),
  ('overall_unit_grades', 'Overall Unit Grades', 'Overall unit grade used for sales quality grouping.', 1),
  ('wwan_support_statuses', 'WWAN Support Statuses', 'Cellular or WWAN capability and module installation status.', 1),
  ('cellular_network_types', 'Cellular Network Types', 'Cellular technology types such as GSM, CDMA, LTE, and 5G.', 1),
  ('wipe_statuses', 'Storage Wipe Statuses', 'Per-drive storage wipe statuses.', 1),
  ('gpu_types', 'GPU Types', 'Graphics adapter types.', 1),
  ('absolute_statuses', 'Absolute Statuses', 'Absolute / Computrace style statuses.', 1),
  ('keyboard_languages', 'Keyboard Languages', 'Keyboard language layouts.', 1),
  ('cosmetic_issue_types', 'Cosmetic Issue Types', 'Configured cosmetic issues that can be selected on unit records.', 1),
  ('cosmetic_severities', 'Cosmetic Severities', 'Minor and major cosmetic severity values.', 1),
  ('issue_locations', 'Issue Locations', 'Physical locations used for cosmetic and hardware issues.', 1),
  ('component_change_reasons', 'Component Change Reasons', 'Reasons RAM, storage, GPU, or cellular module records changed.', 1),
  ('unit_note_types', 'Unit Note Types', 'Types of note/comment records attached to units.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Data source values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'data_sources' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'tech_edit', 'Tech Edit', 'tech_edit', NULL, 10, 1),
  (@category_id, 'scantool', 'ScanTool', 'scantool', NULL, 20, 1),
  (@category_id, 'management_edit', 'Management Edit', 'management_edit', NULL, 30, 1),
  (@category_id, 'system', 'System', 'system', NULL, 40, 1),
  (@category_id, 'import', 'Import', 'import', NULL, 50, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Tri-state values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'tri_state_options' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'yes', 'Yes', 'yes', NULL, 10, 1),
  (@category_id, 'no', 'No', 'no', NULL, 20, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 30, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 40, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Check status values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'check_statuses' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'complete', 'Complete', 'complete', NULL, 10, 1),
  (@category_id, 'incomplete', 'Incomplete', 'incomplete', NULL, 20, 1),
  (@category_id, 'failed', 'Failed', 'failed', NULL, 30, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 40, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 50, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Overall Unit Grade values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'overall_unit_grades' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'a', 'A', 'A', NULL, 10, 1),
  (@category_id, 'b', 'B', 'B', NULL, 20, 1),
  (@category_id, 'c', 'C', 'C', NULL, 30, 1),
  (@category_id, 'd', 'D', 'D', NULL, 40, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 50, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  WWAN / cellular values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'wwan_support_statuses' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'module_installed', 'Module Installed', 'module_installed', NULL, 10, 1),
  (@category_id, 'slot_ready_no_module', 'Slot / Antenna Capable, No Module Installed', 'slot_ready_no_module', NULL, 20, 1),
  (@category_id, 'not_capable', 'Not Capable', 'not_capable', NULL, 30, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 40, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 50, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'cellular_network_types' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'gsm', 'GSM', 'gsm', NULL, 10, 1),
  (@category_id, 'cdma', 'CDMA', 'cdma', NULL, 20, 1),
  (@category_id, 'umts_hspa', 'UMTS / HSPA', 'umts_hspa', NULL, 30, 1),
  (@category_id, 'lte', 'LTE', 'lte', NULL, 40, 1),
  (@category_id, '5g_nr', '5G NR', '5g_nr', NULL, 50, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 60, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Storage wipe values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'wipe_statuses' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'wiped', 'Wiped', 'wiped', NULL, 10, 1),
  (@category_id, 'not_wiped', 'Not Wiped', 'not_wiped', NULL, 20, 1),
  (@category_id, 'wipe_failed', 'Wipe Failed', 'wipe_failed', NULL, 30, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 40, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 50, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  GPU type values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'gpu_types' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'integrated', 'Integrated', 'integrated', NULL, 10, 1),
  (@category_id, 'dedicated', 'Dedicated', 'dedicated', NULL, 20, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 30, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 40, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Absolute status values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'absolute_statuses' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'enabled', 'Enabled', 'enabled', NULL, 10, 1),
  (@category_id, 'disabled', 'Disabled', 'disabled', NULL, 20, 1),
  (@category_id, 'hp_active_not_permanent', 'HP Active Not Permanent', 'hp_active_not_permanent', NULL, 30, 1),
  (@category_id, 'hp_inactive_not_permanent', 'HP Inactive Not Permanent', 'hp_inactive_not_permanent', NULL, 40, 1),
  (@category_id, 'hp_inactive_permanent', 'HP Inactive Permanent', 'hp_inactive_permanent', NULL, 50, 1),
  (@category_id, 'hp_active_permanent', 'HP Active Permanent', 'hp_active_permanent', NULL, 60, 1),
  (@category_id, 'permanently_disabled', 'Permanently Disabled', 'permanently_disabled', NULL, 70, 1),
  (@category_id, 'permanently_enabled', 'Permanently Enabled', 'permanently_enabled', NULL, 80, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 90, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 100, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Keyboard language values
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'keyboard_languages' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'english_us', 'English US', 'english_us', NULL, 10, 1),
  (@category_id, 'english_uk', 'English UK', 'english_uk', NULL, 20, 1),
  (@category_id, 'german', 'German', 'german', NULL, 30, 1),
  (@category_id, 'unknown', 'Unknown', 'unknown', NULL, 40, 1),
  (@category_id, 'not_applicable', 'N/A', 'not_applicable', NULL, 50, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Cosmetic issues, severities, and locations
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'cosmetic_issue_types' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'none', 'None', 'none', NULL, 10, 1),
  (@category_id, 'paint_peeling', 'Paint Peeling', 'paint_peeling', NULL, 20, 1),
  (@category_id, 'chassis_dents', 'Chassis Dents', 'chassis_dents', NULL, 30, 1),
  (@category_id, 'chassis_cracks', 'Chassis Cracks', 'chassis_cracks', NULL, 40, 1),
  (@category_id, 'chassis_scratches', 'Chassis Scratches', 'chassis_scratches', NULL, 50, 1),
  (@category_id, 'chassis_scuffing', 'Chassis Scuffing', 'chassis_scuffing', NULL, 60, 1),
  (@category_id, 'lcd_scratches', 'LCD Scratches', 'lcd_scratches', NULL, 70, 1),
  (@category_id, 'lcd_scuffing', 'LCD Scuffing', 'lcd_scuffing', NULL, 80, 1),
  (@category_id, 'lcd_cracking', 'LCD Cracking', 'lcd_cracking', NULL, 90, 1),
  (@category_id, 'other', 'Other', 'other', NULL, 999, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'cosmetic_severities' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'minor', 'Minor', 'minor', NULL, 10, 1),
  (@category_id, 'major', 'Major', 'major', NULL, 20, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'issue_locations' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'top_cover', 'Top Cover', 'top_cover', NULL, 10, 1),
  (@category_id, 'bottom_cover', 'Bottom Cover', 'bottom_cover', NULL, 20, 1),
  (@category_id, 'palmrest', 'Palmrest', 'palmrest', NULL, 30, 1),
  (@category_id, 'screen', 'Screen', 'screen', NULL, 40, 1),
  (@category_id, 'lcd', 'LCD', 'lcd', NULL, 50, 1),
  (@category_id, 'keyboard', 'Keyboard', 'keyboard', NULL, 60, 1),
  (@category_id, 'touchpad', 'Touchpad', 'touchpad', NULL, 70, 1),
  (@category_id, 'hinges', 'Hinges', 'hinges', NULL, 80, 1),
  (@category_id, 'left_side', 'Left Side', 'left_side', NULL, 90, 1),
  (@category_id, 'right_side', 'Right Side', 'right_side', NULL, 100, 1),
  (@category_id, 'front', 'Front', 'front', NULL, 110, 1),
  (@category_id, 'back', 'Back', 'back', NULL, 120, 1),
  (@category_id, 'ports', 'Ports', 'ports', NULL, 130, 1),
  (@category_id, 'camera', 'Camera', 'camera', NULL, 140, 1),
  (@category_id, 'battery', 'Battery', 'battery', NULL, 150, 1),
  (@category_id, 'motherboard', 'Motherboard', 'motherboard', NULL, 160, 1),
  (@category_id, 'internal', 'Internal', 'internal', NULL, 170, 1),
  (@category_id, 'chassis', 'Chassis', 'chassis', NULL, 180, 1),
  (@category_id, 'other', 'Other', 'other', NULL, 999, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  Component change reasons and note types
  ---------------------------------------------------------------------------
*/

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'component_change_reasons' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'initial_scan', 'Initial Scan', 'initial_scan', NULL, 10, 1),
  (@category_id, 'tech_edit', 'Tech Edit', 'tech_edit', NULL, 20, 1),
  (@category_id, 'upgrade_lot_requirement', 'Upgrade to Meet Lot Requirement', 'upgrade_lot_requirement', NULL, 30, 1),
  (@category_id, 'downgrade_lot_requirement', 'Downgrade to Meet Lot Requirement', 'downgrade_lot_requirement', NULL, 40, 1),
  (@category_id, 'replacement', 'Replacement', 'replacement', NULL, 50, 1),
  (@category_id, 'removed_for_inventory', 'Removed for Inventory Turn-In', 'removed_for_inventory', NULL, 60, 1),
  (@category_id, 'manual_correction', 'Manual Correction', 'manual_correction', NULL, 70, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SET @category_id = (SELECT config_category_id FROM config_categories WHERE code = 'unit_note_types' LIMIT 1);

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order, is_active)
VALUES
  (@category_id, 'general', 'General', 'general', NULL, 10, 1),
  (@category_id, 'tech', 'Tech Note', 'tech', NULL, 20, 1),
  (@category_id, 'management', 'Management Note', 'management', NULL, 30, 1),
  (@category_id, 'scantool', 'ScanTool Note', 'scantool', NULL, 40, 1),
  (@category_id, 'correction', 'Correction', 'correction', NULL, 50, 1)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  ui_color = VALUES(ui_color),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

/*
  ---------------------------------------------------------------------------
  One-row-per-unit specification details.
  These are nullable because requirements are lot-driven, not globally required.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_specifications (
  unit_specification_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,

  bios_version varchar(100) DEFAULT NULL,
  os_build varchar(100) DEFAULT NULL,

  absolute_status_config_value_id int DEFAULT NULL,
  physical_camera_status_config_value_id int DEFAULT NULL,
  touchscreen_status_config_value_id int DEFAULT NULL,
  keyboard_language_config_value_id int DEFAULT NULL,
  complete_diagnostics_status_config_value_id int DEFAULT NULL,
  virus_check_status_config_value_id int DEFAULT NULL,
  driver_check_status_config_value_id int DEFAULT NULL,
  skinned_status_config_value_id int DEFAULT NULL,

  created_by_user_id int DEFAULT NULL,
  updated_by_user_id int DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_specification_id),
  UNIQUE KEY uq_unit_specifications_unit (unit_id),
  KEY idx_unit_specifications_bios_version (bios_version),
  KEY idx_unit_specifications_os_build (os_build),
  KEY fk_unit_specifications_absolute_status (absolute_status_config_value_id),
  KEY fk_unit_specifications_camera_status (physical_camera_status_config_value_id),
  KEY fk_unit_specifications_touchscreen_status (touchscreen_status_config_value_id),
  KEY fk_unit_specifications_keyboard_language (keyboard_language_config_value_id),
  KEY fk_unit_specifications_diagnostics_status (complete_diagnostics_status_config_value_id),
  KEY fk_unit_specifications_virus_status (virus_check_status_config_value_id),
  KEY fk_unit_specifications_driver_status (driver_check_status_config_value_id),
  KEY fk_unit_specifications_skinned_status (skinned_status_config_value_id),
  KEY fk_unit_specifications_created_by (created_by_user_id),
  KEY fk_unit_specifications_updated_by (updated_by_user_id),

  CONSTRAINT fk_unit_specifications_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_specifications_absolute_status FOREIGN KEY (absolute_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_camera_status FOREIGN KEY (physical_camera_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_touchscreen_status FOREIGN KEY (touchscreen_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_keyboard_language FOREIGN KEY (keyboard_language_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_diagnostics_status FOREIGN KEY (complete_diagnostics_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_virus_status FOREIGN KEY (virus_check_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_driver_status FOREIGN KEY (driver_check_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_skinned_status FOREIGN KEY (skinned_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_specifications_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_unit_specifications_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  Flexible source tracking per field.
  This avoids adding one source column for every single unit field.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_field_sources (
  unit_field_source_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,
  field_key varchar(100) NOT NULL,
  source_code varchar(40) NOT NULL DEFAULT 'tech_edit',
  source_note varchar(500) DEFAULT NULL,
  updated_by_user_id int DEFAULT NULL,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_field_source_id),
  UNIQUE KEY uq_unit_field_sources_unit_field (unit_id, field_key),
  KEY idx_unit_field_sources_field (field_key),
  KEY idx_unit_field_sources_source (source_code),
  KEY fk_unit_field_sources_updated_by (updated_by_user_id),

  CONSTRAINT fk_unit_field_sources_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_field_sources_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  Overall Unit Grade history.
  Current grade is represented by latest/current row. We do not overload
  productivity score or QC score.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_grade_assessments (
  unit_grade_assessment_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,
  overall_grade_config_value_id int NOT NULL,
  is_current tinyint(1) NOT NULL DEFAULT 1,
  assessed_by_user_id int DEFAULT NULL,
  source_code varchar(40) NOT NULL DEFAULT 'tech_edit',
  assessed_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes varchar(500) DEFAULT NULL,

  PRIMARY KEY (unit_grade_assessment_id),
  KEY idx_unit_grade_assessments_unit_current (unit_id, is_current, assessed_at),
  KEY idx_unit_grade_assessments_grade (overall_grade_config_value_id),
  KEY idx_unit_grade_assessments_assessed_by (assessed_by_user_id),
  KEY idx_unit_grade_assessments_source (source_code),

  CONSTRAINT fk_unit_grade_assessments_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_grade_assessments_grade FOREIGN KEY (overall_grade_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_grade_assessments_assessed_by FOREIGN KEY (assessed_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  RAM modules.
  Current and previous modules are stored here. Frontend can calculate total RAM
  by summing current rows.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_memory_modules (
  unit_memory_module_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,

  slot_label varchar(75) DEFAULT NULL,
  size_gb int DEFAULT NULL,
  ram_type_config_value_id int DEFAULT NULL,
  speed_mhz int DEFAULT NULL,
  manufacturer_name varchar(150) DEFAULT NULL,
  part_number varchar(150) DEFAULT NULL,
  serial_number varchar(150) DEFAULT NULL,

  is_current tinyint(1) NOT NULL DEFAULT 1,
  installed_at datetime DEFAULT NULL,
  removed_at datetime DEFAULT NULL,
  changed_by_user_id int DEFAULT NULL,
  change_reason_config_value_id int DEFAULT NULL,
  change_notes varchar(500) DEFAULT NULL,

  source_code varchar(40) NOT NULL DEFAULT 'tech_edit',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_memory_module_id),
  KEY idx_unit_memory_modules_unit_current (unit_id, is_current),
  KEY idx_unit_memory_modules_size (size_gb),
  KEY idx_unit_memory_modules_serial (serial_number),
  KEY fk_unit_memory_modules_ram_type (ram_type_config_value_id),
  KEY fk_unit_memory_modules_changed_by (changed_by_user_id),
  KEY fk_unit_memory_modules_change_reason (change_reason_config_value_id),

  CONSTRAINT fk_unit_memory_modules_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_memory_modules_ram_type FOREIGN KEY (ram_type_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_memory_modules_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_unit_memory_modules_change_reason FOREIGN KEY (change_reason_config_value_id) REFERENCES config_values (config_value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  Storage devices.
  Wipe status is per storage device.
  Current and previous devices are stored here.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_storage_devices (
  unit_storage_device_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,

  slot_label varchar(75) DEFAULT NULL,
  storage_type_config_value_id int DEFAULT NULL,
  size_gb int DEFAULT NULL,
  manufacturer_name varchar(150) DEFAULT NULL,
  model_number varchar(150) DEFAULT NULL,
  serial_number varchar(150) DEFAULT NULL,
  firmware_version varchar(150) DEFAULT NULL,

  wipe_status_config_value_id int DEFAULT NULL,
  wiped_by_user_id int DEFAULT NULL,
  wiped_at datetime DEFAULT NULL,

  is_current tinyint(1) NOT NULL DEFAULT 1,
  installed_at datetime DEFAULT NULL,
  removed_at datetime DEFAULT NULL,
  changed_by_user_id int DEFAULT NULL,
  change_reason_config_value_id int DEFAULT NULL,
  change_notes varchar(500) DEFAULT NULL,

  source_code varchar(40) NOT NULL DEFAULT 'tech_edit',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_storage_device_id),
  KEY idx_unit_storage_devices_unit_current (unit_id, is_current),
  KEY idx_unit_storage_devices_size (size_gb),
  KEY idx_unit_storage_devices_serial (serial_number),
  KEY fk_unit_storage_devices_type (storage_type_config_value_id),
  KEY fk_unit_storage_devices_wipe_status (wipe_status_config_value_id),
  KEY fk_unit_storage_devices_wiped_by (wiped_by_user_id),
  KEY fk_unit_storage_devices_changed_by (changed_by_user_id),
  KEY fk_unit_storage_devices_change_reason (change_reason_config_value_id),

  CONSTRAINT fk_unit_storage_devices_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_storage_devices_type FOREIGN KEY (storage_type_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_storage_devices_wipe_status FOREIGN KEY (wipe_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_storage_devices_wiped_by FOREIGN KEY (wiped_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_unit_storage_devices_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_unit_storage_devices_change_reason FOREIGN KEY (change_reason_config_value_id) REFERENCES config_values (config_value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  Cellular / WWAN modules.
  Bands are stored separately for searching/filtering later.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_cellular_modules (
  unit_cellular_module_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,

  wwan_status_config_value_id int DEFAULT NULL,
  module_manufacturer varchar(150) DEFAULT NULL,
  module_model varchar(150) DEFAULT NULL,
  imei varchar(40) DEFAULT NULL,
  firmware_version varchar(150) DEFAULT NULL,

  supported_networks_text varchar(255) DEFAULT NULL,
  supported_carriers_text varchar(255) DEFAULT NULL,
  notes varchar(500) DEFAULT NULL,

  is_current tinyint(1) NOT NULL DEFAULT 1,
  installed_at datetime DEFAULT NULL,
  removed_at datetime DEFAULT NULL,
  changed_by_user_id int DEFAULT NULL,
  change_reason_config_value_id int DEFAULT NULL,

  source_code varchar(40) NOT NULL DEFAULT 'scantool',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_cellular_module_id),
  KEY idx_unit_cellular_modules_unit_current (unit_id, is_current),
  KEY idx_unit_cellular_modules_model (module_model),
  KEY idx_unit_cellular_modules_imei (imei),
  KEY fk_unit_cellular_modules_status (wwan_status_config_value_id),
  KEY fk_unit_cellular_modules_changed_by (changed_by_user_id),
  KEY fk_unit_cellular_modules_change_reason (change_reason_config_value_id),

  CONSTRAINT fk_unit_cellular_modules_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_cellular_modules_status FOREIGN KEY (wwan_status_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_cellular_modules_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_unit_cellular_modules_change_reason FOREIGN KEY (change_reason_config_value_id) REFERENCES config_values (config_value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unit_cellular_module_bands (
  unit_cellular_module_band_id bigint NOT NULL AUTO_INCREMENT,
  unit_cellular_module_id bigint NOT NULL,

  network_type_config_value_id int DEFAULT NULL,
  band_code varchar(30) NOT NULL,
  frequency_label varchar(100) DEFAULT NULL,
  region_note varchar(150) DEFAULT NULL,

  source_code varchar(40) NOT NULL DEFAULT 'scantool',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_cellular_module_band_id),
  UNIQUE KEY uq_unit_cellular_module_bands_unique (unit_cellular_module_id, band_code),
  KEY idx_unit_cellular_module_bands_band (band_code),
  KEY fk_unit_cellular_module_bands_network_type (network_type_config_value_id),

  CONSTRAINT fk_unit_cellular_module_bands_module FOREIGN KEY (unit_cellular_module_id) REFERENCES unit_cellular_modules (unit_cellular_module_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_cellular_module_bands_network_type FOREIGN KEY (network_type_config_value_id) REFERENCES config_values (config_value_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  Graphics adapters.
  Multiple adapters are allowed because many systems have integrated + dedicated.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_graphics_adapters (
  unit_graphics_adapter_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,

  gpu_type_config_value_id int DEFAULT NULL,
  gpu_model varchar(150) DEFAULT NULL,
  vram_mb int DEFAULT NULL,

  is_current tinyint(1) NOT NULL DEFAULT 1,
  source_code varchar(40) NOT NULL DEFAULT 'tech_edit',
  created_by_user_id int DEFAULT NULL,
  updated_by_user_id int DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_graphics_adapter_id),
  KEY idx_unit_graphics_adapters_unit_current (unit_id, is_current),
  KEY idx_unit_graphics_adapters_model (gpu_model),
  KEY fk_unit_graphics_adapters_type (gpu_type_config_value_id),
  KEY fk_unit_graphics_adapters_created_by (created_by_user_id),
  KEY fk_unit_graphics_adapters_updated_by (updated_by_user_id),

  CONSTRAINT fk_unit_graphics_adapters_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_graphics_adapters_type FOREIGN KEY (gpu_type_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_graphics_adapters_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_unit_graphics_adapters_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  Unit issue entries.
  Cosmetic supports configured issue + severity + location + remark.
  Hardware supports mostly custom issue + location + remark. Severity can stay NULL.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_issue_entries (
  unit_issue_entry_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,

  issue_area varchar(30) NOT NULL,
  issue_type_config_value_id int DEFAULT NULL,
  custom_issue_label varchar(150) DEFAULT NULL,
  severity_config_value_id int DEFAULT NULL,
  location_config_value_id int DEFAULT NULL,
  issue_remark mediumtext,

  is_current tinyint(1) NOT NULL DEFAULT 1,
  source_code varchar(40) NOT NULL DEFAULT 'tech_edit',
  created_by_user_id int DEFAULT NULL,
  updated_by_user_id int DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_issue_entry_id),
  KEY idx_unit_issue_entries_unit_area (unit_id, issue_area, is_current),
  KEY idx_unit_issue_entries_type (issue_type_config_value_id),
  KEY idx_unit_issue_entries_custom_label (custom_issue_label),
  KEY fk_unit_issue_entries_severity (severity_config_value_id),
  KEY fk_unit_issue_entries_location (location_config_value_id),
  KEY fk_unit_issue_entries_created_by (created_by_user_id),
  KEY fk_unit_issue_entries_updated_by (updated_by_user_id),

  CONSTRAINT fk_unit_issue_entries_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_issue_entries_type FOREIGN KEY (issue_type_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_issue_entries_severity FOREIGN KEY (severity_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_issue_entries_location FOREIGN KEY (location_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_issue_entries_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_unit_issue_entries_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*
  ---------------------------------------------------------------------------
  Unit comments / note history.
  This replaces the idea of only having one overwritten general comment.
  ---------------------------------------------------------------------------
*/

CREATE TABLE IF NOT EXISTS unit_comments (
  unit_comment_id bigint NOT NULL AUTO_INCREMENT,
  unit_id bigint NOT NULL,
  note_type_config_value_id int DEFAULT NULL,
  comment_text mediumtext NOT NULL,

  source_code varchar(40) NOT NULL DEFAULT 'tech_edit',
  created_by_user_id int DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (unit_comment_id),
  KEY idx_unit_comments_unit_created (unit_id, created_at),
  KEY fk_unit_comments_note_type (note_type_config_value_id),
  KEY fk_unit_comments_created_by (created_by_user_id),

  CONSTRAINT fk_unit_comments_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_comments_note_type FOREIGN KEY (note_type_config_value_id) REFERENCES config_values (config_value_id),
  CONSTRAINT fk_unit_comments_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

COMMIT;