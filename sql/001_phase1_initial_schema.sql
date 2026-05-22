-- BWTDallas Phase 1 Initial Schema
-- Focus: Authentication, Tech Portal, Dashboard productivity, Management/Config foundation.
--
-- Starting point:
--   New database, no existing temporary items/units table.
--
-- Deferred to Phase 2 Warehouse:
--   locations
--   pallets
--   racks/shelves/bins
--   units.current_location_id
--   unit_location_history
--
-- Deferred to Phase 3 Sales:
--   customers
--   sales_orders
--   sales fulfillment workflows
--
-- Naming:
--   Table names are plural.
--   Primary keys and relational foreign keys are singular.
--
-- Asset tag display:
--   Store units.asset_number as numeric.
--   Display as CONCAT('bwt', LPAD(asset_number, 10, '0')).

SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS=0;

DROP VIEW IF EXISTS unit_asset_tags;
DROP VIEW IF EXISTS tech_daily_productivity;

DROP TABLE IF EXISTS productivity_events;
DROP TABLE IF EXISTS scan_batch_items;
DROP TABLE IF EXISTS scan_batches;
DROP TABLE IF EXISTS unit_issue_flags;
DROP TABLE IF EXISTS unit_lot_history;
DROP TABLE IF EXISTS unit_lot_validation_overrides;
DROP TABLE IF EXISTS unit_qc_checks;
DROP TABLE IF EXISTS unit_status_history;
DROP TABLE IF EXISTS unit_completion_credits;
DROP TABLE IF EXISTS unit_takeover_requests;
DROP TABLE IF EXISTS unit_support_tasks;
DROP TABLE IF EXISTS unit_work_session_tasks;
DROP TABLE IF EXISTS unit_work_sessions;
DROP TABLE IF EXISTS unit_identifiers;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS lot_requirements;
DROP TABLE IF EXISTS lots;
DROP TABLE IF EXISTS processor_models;
DROP TABLE IF EXISTS processor_brands;
DROP TABLE IF EXISTS unit_models;
DROP TABLE IF EXISTS manufacturers;
DROP TABLE IF EXISTS user_password_links;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS config_values;
DROP TABLE IF EXISTS config_categories;

SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;

CREATE TABLE config_categories (
  config_category_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(75) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE config_values (
  config_value_id INT AUTO_INCREMENT PRIMARY KEY,
  config_category_id INT NOT NULL,
  code VARCHAR(75) NOT NULL,
  label VARCHAR(150) NOT NULL,
  value VARCHAR(255) NULL,
  ui_color VARCHAR(30) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_config_values_category_code (config_category_id, code),
  INDEX idx_config_values_code (code),
  INDEX idx_config_values_active_sort (config_category_id, is_active, sort_order),
  CONSTRAINT fk_config_values_category
    FOREIGN KEY (config_category_id) REFERENCES config_categories(config_category_id)
) ENGINE=InnoDB;

CREATE TABLE roles (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  account_status_config_value_id INT NULL,
  first_name VARCHAR(75) NOT NULL,
  last_name VARCHAR(75) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  employment_status VARCHAR(40) NOT NULL DEFAULT 'active',
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  password_updated_at DATETIME NULL,
  last_login_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_name (last_name, first_name),
  INDEX idx_users_account_status (account_status_config_value_id),
  CONSTRAINT fk_users_account_status
    FOREIGN KEY (account_status_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE user_roles (
  user_role_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_roles_user_role (user_id, role_id),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
) ENGINE=InnoDB;

CREATE TABLE user_password_links (
  user_password_link_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  link_type_config_value_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_password_links_user (user_id),
  INDEX idx_user_password_links_expires (expires_at),
  CONSTRAINT fk_user_password_links_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_password_links_type
    FOREIGN KEY (link_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_user_password_links_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE manufacturers (
  manufacturer_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(75) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE unit_models (
  unit_model_id INT AUTO_INCREMENT PRIMARY KEY,
  manufacturer_id INT NOT NULL,
  unit_category_config_value_id INT NOT NULL,
  model_name VARCHAR(150) NOT NULL,
  model_number VARCHAR(100) NULL,
  model_identifier VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_unit_models_unique (manufacturer_id, unit_category_config_value_id, model_name, model_number, model_identifier),
  INDEX idx_unit_models_category (unit_category_config_value_id),
  CONSTRAINT fk_unit_models_manufacturer
    FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(manufacturer_id),
  CONSTRAINT fk_unit_models_category
    FOREIGN KEY (unit_category_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE processor_brands (
  processor_brand_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(75) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE processor_models (
  processor_model_id INT AUTO_INCREMENT PRIMARY KEY,
  processor_brand_id INT NOT NULL,
  processor_family VARCHAR(100) NULL,
  model_code VARCHAR(100) NOT NULL,
  base_speed_ghz DECIMAL(5,2) NULL,
  generation VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_processor_models_unique (processor_brand_id, processor_family, model_code, base_speed_ghz),
  CONSTRAINT fk_processor_models_brand
    FOREIGN KEY (processor_brand_id) REFERENCES processor_brands(processor_brand_id)
) ENGINE=InnoDB;

CREATE TABLE lots (
  lot_id INT AUTO_INCREMENT PRIMARY KEY,
  parent_lot_id INT NULL,
  lot_type_config_value_id INT NOT NULL,
  lot_status_config_value_id INT NOT NULL,
  requirement_policy_config_value_id INT NOT NULL,
  default_grade_config_value_id INT NULL,
  abandoned_reason_config_value_id INT NULL,
  abandoned_by_user_id INT NULL,
  created_by_user_id INT NULL,
  lot_number VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  source_name VARCHAR(100) NULL,
  unit_amount_goal INT NULL,
  allow_unlimited_units TINYINT(1) NOT NULL DEFAULT 0,
  deadline_at DATETIME NULL,
  objectives MEDIUMTEXT NULL,
  label_format VARCHAR(255) NULL,
  abandoned_at DATETIME NULL,
  received_at DATETIME NULL,
  ready_at DATETIME NULL,
  closed_at DATETIME NULL,
  notes MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lots_parent (parent_lot_id),
  INDEX idx_lots_type_status (lot_type_config_value_id, lot_status_config_value_id),
  INDEX idx_lots_requirement_policy (requirement_policy_config_value_id),
  CONSTRAINT fk_lots_parent
    FOREIGN KEY (parent_lot_id) REFERENCES lots(lot_id),
  CONSTRAINT fk_lots_type
    FOREIGN KEY (lot_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_lots_status
    FOREIGN KEY (lot_status_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_lots_requirement_policy
    FOREIGN KEY (requirement_policy_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_lots_default_grade
    FOREIGN KEY (default_grade_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_lots_abandoned_reason
    FOREIGN KEY (abandoned_reason_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_lots_abandoned_by
    FOREIGN KEY (abandoned_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_lots_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE lot_requirements (
  lot_requirement_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lot_id INT NOT NULL,
  requirement_type_config_value_id INT NOT NULL,
  requirement_config_value_id INT NULL,
  manufacturer_id INT NULL,
  unit_model_id INT NULL,
  processor_model_id INT NULL,
  comparison_operator_config_value_id INT NULL,
  requirement_text VARCHAR(255) NULL,
  requirement_number DECIMAL(10,2) NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lot_requirements_lot (lot_id),
  INDEX idx_lot_requirements_type (requirement_type_config_value_id),
  CONSTRAINT fk_lot_requirements_lot
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id) ON DELETE CASCADE,
  CONSTRAINT fk_lot_requirements_type
    FOREIGN KEY (requirement_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_lot_requirements_config_value
    FOREIGN KEY (requirement_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_lot_requirements_manufacturer
    FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(manufacturer_id),
  CONSTRAINT fk_lot_requirements_model
    FOREIGN KEY (unit_model_id) REFERENCES unit_models(unit_model_id),
  CONSTRAINT fk_lot_requirements_processor
    FOREIGN KEY (processor_model_id) REFERENCES processor_models(processor_model_id),
  CONSTRAINT fk_lot_requirements_operator
    FOREIGN KEY (comparison_operator_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE units (
  unit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_number BIGINT NOT NULL UNIQUE,
  lot_id INT NOT NULL,
  unit_category_config_value_id INT NOT NULL,
  current_unit_status_config_value_id INT NOT NULL,
  manufacturer_id INT NULL,
  unit_model_id INT NULL,
  processor_model_id INT NULL,
  processor_speed_ghz DECIMAL(5,2) NULL,
  ram_gb INT NULL,
  ram_type_config_value_id INT NULL,
  storage_gb INT NULL,
  storage_type_config_value_id INT NULL,
  operating_system_config_value_id INT NULL,
  hardware_notes MEDIUMTEXT NULL,
  cosmetic_notes MEDIUMTEXT NULL,
  created_by_user_id INT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_units_lot (lot_id),
  INDEX idx_units_category (unit_category_config_value_id),
  INDEX idx_units_status (current_unit_status_config_value_id),
  INDEX idx_units_asset_number (asset_number),
  INDEX idx_units_manufacturer (manufacturer_id),
  INDEX idx_units_model (unit_model_id),
  INDEX idx_units_completed (completed_at),
  CONSTRAINT fk_units_lot
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id),
  CONSTRAINT fk_units_category
    FOREIGN KEY (unit_category_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_units_status
    FOREIGN KEY (current_unit_status_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_units_manufacturer
    FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(manufacturer_id),
  CONSTRAINT fk_units_model
    FOREIGN KEY (unit_model_id) REFERENCES unit_models(unit_model_id),
  CONSTRAINT fk_units_processor
    FOREIGN KEY (processor_model_id) REFERENCES processor_models(processor_model_id),
  CONSTRAINT fk_units_ram_type
    FOREIGN KEY (ram_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_units_storage_type
    FOREIGN KEY (storage_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_units_operating_system
    FOREIGN KEY (operating_system_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_units_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB AUTO_INCREMENT=3847;

CREATE TABLE unit_identifiers (
  unit_identifier_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  identifier_type_config_value_id INT NOT NULL,
  identifier_value VARCHAR(150) NOT NULL,
  normalized_value VARCHAR(150) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_unit_identifiers_type_normalized (identifier_type_config_value_id, normalized_value),
  INDEX idx_unit_identifiers_unit (unit_id),
  INDEX idx_unit_identifiers_normalized (normalized_value),
  CONSTRAINT fk_unit_identifiers_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_identifiers_type
    FOREIGN KEY (identifier_type_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE unit_work_sessions (
  unit_work_session_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  tech_user_id INT NOT NULL,
  workflow_stage_config_value_id INT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  duration_seconds INT NULL,
  session_status VARCHAR(40) NOT NULL DEFAULT 'active',
  notes MEDIUMTEXT NULL,
  INDEX idx_unit_work_sessions_unit (unit_id, started_at),
  INDEX idx_unit_work_sessions_tech (tech_user_id, started_at),
  CONSTRAINT fk_unit_work_sessions_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_work_sessions_tech
    FOREIGN KEY (tech_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_work_sessions_stage
    FOREIGN KEY (workflow_stage_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE unit_work_session_tasks (
  unit_work_session_task_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_work_session_id BIGINT NOT NULL,
  task_type_config_value_id INT NULL,
  task_result_config_value_id INT NULL,
  task_name VARCHAR(150) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  notes MEDIUMTEXT NULL,
  INDEX idx_unit_work_session_tasks_session (unit_work_session_id),
  CONSTRAINT fk_unit_work_session_tasks_session
    FOREIGN KEY (unit_work_session_id) REFERENCES unit_work_sessions(unit_work_session_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_work_session_tasks_type
    FOREIGN KEY (task_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_unit_work_session_tasks_result
    FOREIGN KEY (task_result_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE unit_support_tasks (
  unit_support_task_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NULL,
  support_user_id INT NOT NULL,
  support_task_type_config_value_id INT NOT NULL,
  productivity_weight DECIMAL(6,3) NOT NULL DEFAULT 0.250,
  quantity DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  started_at DATETIME NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes MEDIUMTEXT NULL,
  INDEX idx_unit_support_tasks_unit (unit_id),
  INDEX idx_unit_support_tasks_user_completed (support_user_id, completed_at),
  INDEX idx_unit_support_tasks_type (support_task_type_config_value_id),
  CONSTRAINT fk_unit_support_tasks_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_support_tasks_user
    FOREIGN KEY (support_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_support_tasks_type
    FOREIGN KEY (support_task_type_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE unit_takeover_requests (
  unit_takeover_request_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  requested_by_user_id INT NOT NULL,
  requested_from_user_id INT NULL,
  approved_by_user_id INT NULL,
  takeover_status_config_value_id INT NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  approved_at DATETIME NULL,
  denied_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  reason VARCHAR(500) NULL,
  notes VARCHAR(500) NULL,
  INDEX idx_unit_takeover_requests_unit (unit_id, takeover_status_config_value_id, expires_at),
  INDEX idx_unit_takeover_requests_requested_by (requested_by_user_id, requested_at),
  CONSTRAINT fk_unit_takeover_requests_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_takeover_requests_requested_by
    FOREIGN KEY (requested_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_takeover_requests_requested_from
    FOREIGN KEY (requested_from_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_takeover_requests_approved_by
    FOREIGN KEY (approved_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_takeover_requests_status
    FOREIGN KEY (takeover_status_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE unit_completion_credits (
  unit_completion_credit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  credit_weight DECIMAL(6,3) NOT NULL DEFAULT 1.000,
  credit_reason_config_value_id INT NULL,
  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  credited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(500) NULL,
  INDEX idx_unit_completion_credits_unit (unit_id),
  INDEX idx_unit_completion_credits_user_date (user_id, credited_at),
  CONSTRAINT fk_unit_completion_credits_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_completion_credits_user
    FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_completion_credits_reason
    FOREIGN KEY (credit_reason_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_unit_completion_credits_approved_by
    FOREIGN KEY (approved_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE unit_status_history (
  unit_status_history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  from_status_config_value_id INT NULL,
  to_status_config_value_id INT NOT NULL,
  changed_by_user_id INT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(500) NULL,
  INDEX idx_unit_status_history_unit (unit_id, changed_at),
  CONSTRAINT fk_unit_status_history_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_status_history_from
    FOREIGN KEY (from_status_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_unit_status_history_to
    FOREIGN KEY (to_status_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_unit_status_history_user
    FOREIGN KEY (changed_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE unit_qc_checks (
  unit_qc_check_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  checked_by_user_id INT NOT NULL,
  qc_result_config_value_id INT NULL,
  hardware_accuracy_score TINYINT UNSIGNED NULL,
  cosmetic_accuracy_score TINYINT UNSIGNED NULL,
  cleanliness_score TINYINT UNSIGNED NULL,
  labeling_score TINYINT UNSIGNED NULL,
  overall_score TINYINT UNSIGNED NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  notes MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unit_qc_checks_unit (unit_id),
  INDEX idx_unit_qc_checks_user (checked_by_user_id),
  CONSTRAINT fk_unit_qc_checks_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_qc_checks_user
    FOREIGN KEY (checked_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_qc_checks_result
    FOREIGN KEY (qc_result_config_value_id) REFERENCES config_values(config_value_id),
  CHECK (hardware_accuracy_score IS NULL OR hardware_accuracy_score <= 100),
  CHECK (cosmetic_accuracy_score IS NULL OR cosmetic_accuracy_score <= 100),
  CHECK (cleanliness_score IS NULL OR cleanliness_score <= 100),
  CHECK (labeling_score IS NULL OR labeling_score <= 100),
  CHECK (overall_score IS NULL OR overall_score <= 100)
) ENGINE=InnoDB;

CREATE TABLE unit_lot_validation_overrides (
  unit_lot_validation_override_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  lot_id INT NOT NULL,
  requested_by_user_id INT NULL,
  approved_by_user_id INT NULL,
  override_status_config_value_id INT NOT NULL,
  reason VARCHAR(500) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME NULL,
  denied_at DATETIME NULL,
  INDEX idx_unit_lot_validation_overrides_unit (unit_id),
  INDEX idx_unit_lot_validation_overrides_lot (lot_id),
  CONSTRAINT fk_unit_lot_validation_overrides_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_lot_validation_overrides_lot
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id),
  CONSTRAINT fk_unit_lot_validation_overrides_requested_by
    FOREIGN KEY (requested_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_lot_validation_overrides_approved_by
    FOREIGN KEY (approved_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_lot_validation_overrides_status
    FOREIGN KEY (override_status_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE unit_lot_history (
  unit_lot_history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  from_lot_id INT NULL,
  to_lot_id INT NOT NULL,
  moved_by_user_id INT NOT NULL,
  reason_config_value_id INT NULL,
  moved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(500) NULL,
  INDEX idx_unit_lot_history_unit (unit_id, moved_at),
  INDEX idx_unit_lot_history_from_lot (from_lot_id),
  INDEX idx_unit_lot_history_to_lot (to_lot_id),
  CONSTRAINT fk_unit_lot_history_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_lot_history_from_lot
    FOREIGN KEY (from_lot_id) REFERENCES lots(lot_id),
  CONSTRAINT fk_unit_lot_history_to_lot
    FOREIGN KEY (to_lot_id) REFERENCES lots(lot_id),
  CONSTRAINT fk_unit_lot_history_moved_by
    FOREIGN KEY (moved_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_lot_history_reason
    FOREIGN KEY (reason_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE unit_issue_flags (
  unit_issue_flag_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  issue_type_config_value_id INT NOT NULL,
  issue_status_config_value_id INT NOT NULL,
  reported_by_user_id INT NULL,
  resolved_by_user_id INT NULL,
  reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  INDEX idx_unit_issue_flags_unit (unit_id, issue_status_config_value_id),
  INDEX idx_unit_issue_flags_type (issue_type_config_value_id),
  CONSTRAINT fk_unit_issue_flags_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_issue_flags_type
    FOREIGN KEY (issue_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_unit_issue_flags_status
    FOREIGN KEY (issue_status_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_unit_issue_flags_reported_by
    FOREIGN KEY (reported_by_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_unit_issue_flags_resolved_by
    FOREIGN KEY (resolved_by_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE scan_batches (
  scan_batch_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_by_user_id INT NOT NULL,
  purpose_config_value_id INT NULL,
  batch_name VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scan_batches_user (created_by_user_id, created_at),
  CONSTRAINT fk_scan_batches_user
    FOREIGN KEY (created_by_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_scan_batches_purpose
    FOREIGN KEY (purpose_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

CREATE TABLE scan_batch_items (
  scan_batch_item_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scan_batch_id BIGINT NOT NULL,
  unit_id BIGINT NULL,
  searched_value VARCHAR(150) NOT NULL,
  matched_status VARCHAR(40) NOT NULL DEFAULT 'matched',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scan_batch_items_batch (scan_batch_id),
  INDEX idx_scan_batch_items_unit (unit_id),
  CONSTRAINT fk_scan_batch_items_batch
    FOREIGN KEY (scan_batch_id) REFERENCES scan_batches(scan_batch_id) ON DELETE CASCADE,
  CONSTRAINT fk_scan_batch_items_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE productivity_events (
  productivity_event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  unit_id BIGINT NULL,
  productivity_type_config_value_id INT NOT NULL,
  productivity_task_config_value_id INT NULL,
  source_table VARCHAR(75) NULL,
  source_id BIGINT NULL,
  productivity_weight DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  quantity DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  productivity_units DECIMAL(8,3) NOT NULL DEFAULT 0.000,
  credited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes MEDIUMTEXT NULL,
  INDEX idx_productivity_events_user_date (user_id, credited_at),
  INDEX idx_productivity_events_unit (unit_id),
  INDEX idx_productivity_events_type (productivity_type_config_value_id),
  CONSTRAINT fk_productivity_events_user
    FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_productivity_events_unit
    FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE SET NULL,
  CONSTRAINT fk_productivity_events_type
    FOREIGN KEY (productivity_type_config_value_id) REFERENCES config_values(config_value_id),
  CONSTRAINT fk_productivity_events_task
    FOREIGN KEY (productivity_task_config_value_id) REFERENCES config_values(config_value_id)
) ENGINE=InnoDB;

-- Starter config categories.
INSERT INTO config_categories (code, name, description) VALUES
('account_statuses', 'Account Statuses', 'User account login states'),
('password_link_types', 'Password Link Types', 'Initial setup and password reset link types'),
('unit_categories', 'Unit Categories', 'Laptop, Desktop, MacBook, and future device categories'),
('unit_statuses', 'Unit Statuses', 'Current and historical unit lifecycle statuses'),
('identifier_types', 'Identifier Types', 'Asset tag, unit serial, BIOS serial'),
('lot_types', 'Lot Types', 'Receiving, processing, ready stock, hold, as-is, export, refurbisher, abandoned'),
('lot_statuses', 'Lot Statuses', 'Lot lifecycle statuses'),
('requirement_policies', 'Requirement Policies', 'Lot requirement enforcement behavior'),
('unit_grades', 'Unit Grades', 'A, B, C, D grades'),
('ram_types', 'RAM Types', 'DDR and LPDDR memory types'),
('storage_types', 'Storage Types', 'SATA, NVMe, eMMC, Apple SSD'),
('operating_systems', 'Operating Systems', 'Approved operating system choices'),
('workflow_stages', 'Workflow Stages', 'Tech workflow stages'),
('task_types', 'Task Types', 'Reusable task types'),
('task_results', 'Task Results', 'Task result values'),
('support_task_types', 'Support Task Types', 'Weighted secondary productivity tasks'),
('productivity_types', 'Productivity Types', 'Full unit, support, and QC productivity event types'),
('qc_results', 'QC Results', 'Quality control result values'),
('takeover_statuses', 'Takeover Statuses', 'Takeover request statuses'),
('completion_credit_reasons', 'Completion Credit Reasons', 'Reasons for unit completion credit'),
('override_statuses', 'Override Statuses', 'Approval override statuses'),
('lot_move_reasons', 'Lot Move Reasons', 'Reasons a unit moved between lots'),
('issue_types', 'Issue Types', 'Unit issue flag types'),
('issue_statuses', 'Issue Statuses', 'Unit issue status values'),
('abandoned_reasons', 'Abandoned Reasons', 'Reasons a lot or unit workflow was abandoned'),
('scan_batch_purposes', 'Scan Batch Purposes', 'Saved scan batch purposes'),
('scan_batch_user_limits', 'Scan Batch User Limits', 'Per-user saved scan batch limits by role/department'),
('lot_requirement_types', 'Lot Requirement Types', 'Types of requirements a lot can enforce'),
('comparison_operators', 'Comparison Operators', 'Requirement comparison operators');

-- Starter roles.
INSERT INTO roles (code, name, description) VALUES
('tech', 'Tech', 'Standard refurbishing technician'),
('tech_lead', 'Tech Lead', 'Lead user who can approve takeovers and view productivity metrics'),
('management', 'Management', 'Management reporting, approvals, and global controls'),
('packing', 'Packing', 'Packing and boxed/wrapped unit status updates'),
('qc', 'QC', 'Quality control inspections and grading'),
('warehouse', 'Warehouse', 'Reserved for Phase 2 Warehouse Portal'),
('sales', 'Sales', 'Reserved for Phase 3 Sales Portal'),
('admin', 'Admin', 'Full administrative access');

-- Helper insertion pattern.
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'pending_setup', 'Pending Setup', 'pending_setup', 10 FROM config_categories WHERE code = 'account_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'active', 'Active', 'active', 20 FROM config_categories WHERE code = 'account_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'locked', 'Locked', 'locked', 30 FROM config_categories WHERE code = 'account_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'disabled', 'Disabled', 'disabled', 40 FROM config_categories WHERE code = 'account_statuses';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'initial_password_setup', 'Initial Password Setup', 'initial_password_setup', 10 FROM config_categories WHERE code = 'password_link_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'password_reset', 'Password Reset', 'password_reset', 20 FROM config_categories WHERE code = 'password_link_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'laptop', 'Laptop', 'laptop', 10 FROM config_categories WHERE code = 'unit_categories';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'desktop', 'Desktop', 'desktop', 20 FROM config_categories WHERE code = 'unit_categories';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'macbook', 'MacBook', 'macbook', 30 FROM config_categories WHERE code = 'unit_categories';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'phone', 'Phone', 'phone', 90 FROM config_categories WHERE code = 'unit_categories';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'watch', 'Watch', 'watch', 100 FROM config_categories WHERE code = 'unit_categories';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'server', 'Server', 'server', 110 FROM config_categories WHERE code = 'unit_categories';

INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'received', 'Received', 'received', '#94a3b8', 10 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'diagnostics', 'Diagnostics', 'diagnostics', '#facc15', 20 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'repair', 'Repair', 'repair', '#fb923c', 30 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'os_install', 'OS Install', 'os_install', '#38bdf8', 40 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'cleaning', 'Cleaning', 'cleaning', '#22c55e', 50 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'unit_grading', 'Unit Grading', 'unit_grading', '#a855f7', 60 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'recording', 'Recording', 'recording', '#f97316', 70 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'packing', 'Packing', 'packing', '#0ea5e9', 80 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'packaged_boxed', 'Packaged / Boxed', 'packaged_boxed', '#14b8a6', 90 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'wrapped_on_pallet_ready_to_ship', 'Wrapped on Pallet / Ready to Ship', 'wrapped_on_pallet_ready_to_ship', '#16a34a', 100 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'complete', 'Complete', 'complete', '#15803d', 110 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'qc_hold', 'QC Hold', 'qc_hold', '#7c3aed', 120 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'hold', 'Hold', 'hold', '#64748b', 130 FROM config_categories WHERE code = 'unit_statuses';
INSERT INTO config_values (config_category_id, code, label, value, ui_color, sort_order)
SELECT config_category_id, 'needs_review', 'Needs Review', 'needs_review', '#dc2626', 140 FROM config_categories WHERE code = 'unit_statuses';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'asset_tag', 'Asset Tag', 'asset_tag', 10 FROM config_categories WHERE code = 'identifier_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'unit_serial', 'Unit Serial', 'unit_serial', 20 FROM config_categories WHERE code = 'identifier_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'bios_serial', 'BIOS Serial', 'bios_serial', 30 FROM config_categories WHERE code = 'identifier_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'receiving', 'Receiving Lot', 'receiving', 10 FROM config_categories WHERE code = 'lot_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'processing', 'Processing Lot', 'processing', 20 FROM config_categories WHERE code = 'lot_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'ready_stock', 'Ready Stock Lot', 'ready_stock', 30 FROM config_categories WHERE code = 'lot_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'hold', 'Hold Lot', 'hold', 40 FROM config_categories WHERE code = 'lot_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'as_is', 'As-Is Lot', 'as_is', 50 FROM config_categories WHERE code = 'lot_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'export', 'Export Lot', 'export', 60 FROM config_categories WHERE code = 'lot_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'refurbisher', 'Refurbisher Lot', 'refurbisher', 70 FROM config_categories WHERE code = 'lot_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'abandoned', 'Abandoned Lot', 'abandoned', 80 FROM config_categories WHERE code = 'lot_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'created', 'Created', 'created', 10 FROM config_categories WHERE code = 'lot_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'receiving', 'Receiving', 'receiving', 20 FROM config_categories WHERE code = 'lot_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'in_progress', 'In Progress', 'in_progress', 30 FROM config_categories WHERE code = 'lot_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'ready', 'Ready', 'ready', 40 FROM config_categories WHERE code = 'lot_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'fulfilled', 'Fulfilled', 'fulfilled', 50 FROM config_categories WHERE code = 'lot_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'on_hold', 'On Hold', 'on_hold', 60 FROM config_categories WHERE code = 'lot_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'closed', 'Closed', 'closed', 70 FROM config_categories WHERE code = 'lot_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'abandoned', 'Abandoned', 'abandoned', 80 FROM config_categories WHERE code = 'lot_statuses';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'strict', 'Strict', 'strict', 10 FROM config_categories WHERE code = 'requirement_policies';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'warn_only', 'Warn Only', 'warn_only', 20 FROM config_categories WHERE code = 'requirement_policies';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'open_mixed', 'Open / Mixed', 'open_mixed', 30 FROM config_categories WHERE code = 'requirement_policies';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'a', 'A', 'a', 10 FROM config_categories WHERE code = 'unit_grades';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'b', 'B', 'b', 20 FROM config_categories WHERE code = 'unit_grades';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'c', 'C', 'c', 30 FROM config_categories WHERE code = 'unit_grades';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'd', 'D', 'd', 40 FROM config_categories WHERE code = 'unit_grades';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'ddr3', 'DDR3', 'ddr3', 10 FROM config_categories WHERE code = 'ram_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'ddr4', 'DDR4', 'ddr4', 20 FROM config_categories WHERE code = 'ram_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'ddr5', 'DDR5', 'ddr5', 30 FROM config_categories WHERE code = 'ram_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'lpddr4', 'LPDDR4', 'lpddr4', 40 FROM config_categories WHERE code = 'ram_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'lpddr5', 'LPDDR5', 'lpddr5', 50 FROM config_categories WHERE code = 'ram_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'sata_2_5', '2.5" SATA', 'sata_2_5', 10 FROM config_categories WHERE code = 'storage_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'm2_sata', 'M.2 SATA', 'm2_sata', 20 FROM config_categories WHERE code = 'storage_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'm2_nvme', 'M.2 NVMe', 'm2_nvme', 30 FROM config_categories WHERE code = 'storage_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'emmc', 'eMMC', 'emmc', 40 FROM config_categories WHERE code = 'storage_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'apple_ssd', 'Apple SSD', 'apple_ssd', 50 FROM config_categories WHERE code = 'storage_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'windows_11_pro', 'Windows 11 Pro', 'windows_11_pro', 10 FROM config_categories WHERE code = 'operating_systems';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'macos', 'macOS', 'macos', 20 FROM config_categories WHERE code = 'operating_systems';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'chromeos', 'ChromeOS', 'chromeos', 30 FROM config_categories WHERE code = 'operating_systems';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'no_os', 'No OS', 'no_os', 40 FROM config_categories WHERE code = 'operating_systems';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'diagnostics', 'Diagnostics', 'diagnostics', 10 FROM config_categories WHERE code = 'workflow_stages';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'repair', 'Repair', 'repair', 20 FROM config_categories WHERE code = 'workflow_stages';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'os_install', 'OS Install', 'os_install', 30 FROM config_categories WHERE code = 'workflow_stages';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'cleaning', 'Cleaning', 'cleaning', 40 FROM config_categories WHERE code = 'workflow_stages';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'unit_grading', 'Unit Grading', 'unit_grading', 50 FROM config_categories WHERE code = 'workflow_stages';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'recording', 'Recording', 'recording', 60 FROM config_categories WHERE code = 'workflow_stages';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'packing', 'Packing', 'packing', 70 FROM config_categories WHERE code = 'workflow_stages';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'complete', 'Complete', 'complete', 80 FROM config_categories WHERE code = 'workflow_stages';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'pass', 'Pass', 'pass', 10 FROM config_categories WHERE code = 'task_results';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'fail', 'Fail', 'fail', 20 FROM config_categories WHERE code = 'task_results';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'needs_review', 'Needs Review', 'needs_review', 30 FROM config_categories WHERE code = 'task_results';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'cleaning_support', 'Cleaning Support', '0.250', 10 FROM config_categories WHERE code = 'support_task_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'packing_support', 'Packing Support', '0.250', 20 FROM config_categories WHERE code = 'support_task_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'hardware_change_support', 'Hardware Change Support', '0.500', 30 FROM config_categories WHERE code = 'support_task_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'os_install_support', 'OS Install Support', '0.500', 40 FROM config_categories WHERE code = 'support_task_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'quick_verification', 'Quick Verification', '0.100', 50 FROM config_categories WHERE code = 'support_task_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'standard_qc_check', 'Standard QC Check', '0.200', 60 FROM config_categories WHERE code = 'support_task_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'full_unit', 'Full Unit', 'full_unit', 10 FROM config_categories WHERE code = 'productivity_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'support', 'Support Work', 'support', 20 FROM config_categories WHERE code = 'productivity_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'qc', 'QC Work', 'qc', 30 FROM config_categories WHERE code = 'productivity_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'pass', 'Pass', 'pass', 10 FROM config_categories WHERE code = 'qc_results';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'fail', 'Fail', 'fail', 20 FROM config_categories WHERE code = 'qc_results';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'needs_review', 'Needs Review', 'needs_review', 30 FROM config_categories WHERE code = 'qc_results';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'pending', 'Pending', 'pending', 10 FROM config_categories WHERE code = 'takeover_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'approved', 'Approved', 'approved', 20 FROM config_categories WHERE code = 'takeover_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'denied', 'Denied', 'denied', 30 FROM config_categories WHERE code = 'takeover_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'cancelled', 'Cancelled', 'cancelled', 40 FROM config_categories WHERE code = 'takeover_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'expired', 'Expired', 'expired', 50 FROM config_categories WHERE code = 'takeover_statuses';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'standard_completion', 'Standard Completion', 'standard_completion', 10 FROM config_categories WHERE code = 'completion_credit_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'shared_takeover', 'Shared Takeover Credit', 'shared_takeover', 20 FROM config_categories WHERE code = 'completion_credit_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'management_override', 'Management Override', 'management_override', 30 FROM config_categories WHERE code = 'completion_credit_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'full_retest_required', 'Full Retest Required', 'full_retest_required', 40 FROM config_categories WHERE code = 'completion_credit_reasons';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'pending', 'Pending', 'pending', 10 FROM config_categories WHERE code = 'override_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'approved', 'Approved', 'approved', 20 FROM config_categories WHERE code = 'override_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'denied', 'Denied', 'denied', 30 FROM config_categories WHERE code = 'override_statuses';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'wrong_lot', 'Wrong Lot', 'wrong_lot', 10 FROM config_categories WHERE code = 'lot_move_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'moved_to_as_is', 'Moved to As-Is', 'moved_to_as_is', 20 FROM config_categories WHERE code = 'lot_move_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'moved_to_export', 'Moved to Export', 'moved_to_export', 30 FROM config_categories WHERE code = 'lot_move_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'moved_to_refurbisher', 'Moved to Refurbisher', 'moved_to_refurbisher', 40 FROM config_categories WHERE code = 'lot_move_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'management_override', 'Management Override', 'management_override', 50 FROM config_categories WHERE code = 'lot_move_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'quality_issue', 'Quality Issue', 'quality_issue', 60 FROM config_categories WHERE code = 'lot_move_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'lot_fulfilled', 'Lot Fulfilled', 'lot_fulfilled', 70 FROM config_categories WHERE code = 'lot_move_reasons';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'low_battery', 'Low Battery', 'low_battery', 10 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'poor_cosmetics', 'Poor Cosmetics', 'poor_cosmetics', 20 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'pxe_failure', 'PXE Failure', 'pxe_failure', 30 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'bios_locked', 'BIOS Locked', 'bios_locked', 40 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'intune_locked', 'Intune Locked', 'intune_locked', 50 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'apple_id_locked', 'Apple ID Locked', 'apple_id_locked', 60 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'no_power', 'No Power', 'no_power', 70 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'bad_screen', 'Bad Screen', 'bad_screen', 80 FROM config_categories WHERE code = 'issue_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'missing_parts', 'Missing Parts', 'missing_parts', 90 FROM config_categories WHERE code = 'issue_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'open', 'Open', 'open', 10 FROM config_categories WHERE code = 'issue_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'resolved', 'Resolved', 'resolved', 20 FROM config_categories WHERE code = 'issue_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'waived', 'Waived', 'waived', 30 FROM config_categories WHERE code = 'issue_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'moved_to_as_is', 'Moved to As-Is', 'moved_to_as_is', 40 FROM config_categories WHERE code = 'issue_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'moved_to_export', 'Moved to Export', 'moved_to_export', 50 FROM config_categories WHERE code = 'issue_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'moved_to_refurbisher', 'Moved to Refurbisher', 'moved_to_refurbisher', 60 FROM config_categories WHERE code = 'issue_statuses';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'abandoned', 'Abandoned', 'abandoned', 70 FROM config_categories WHERE code = 'issue_statuses';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'severe_cosmetics', 'Severe Cosmetics', 'severe_cosmetics', 10 FROM config_categories WHERE code = 'abandoned_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'locked_units', 'Locked Units', 'locked_units', 20 FROM config_categories WHERE code = 'abandoned_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'pxe_failure', 'PXE Failure', 'pxe_failure', 30 FROM config_categories WHERE code = 'abandoned_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'low_battery', 'Low Battery', 'low_battery', 40 FROM config_categories WHERE code = 'abandoned_reasons';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'management_decision', 'Management Decision', 'management_decision', 50 FROM config_categories WHERE code = 'abandoned_reasons';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'general_search', 'General Search', 'general_search', 10 FROM config_categories WHERE code = 'scan_batch_purposes';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'qc_review', 'QC Review', 'qc_review', 20 FROM config_categories WHERE code = 'scan_batch_purposes';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'packing', 'Packing', 'packing', 30 FROM config_categories WHERE code = 'scan_batch_purposes';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'lot_move', 'Lot Move', 'lot_move', 40 FROM config_categories WHERE code = 'scan_batch_purposes';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'management_review', 'Management Review', 'management_review', 50 FROM config_categories WHERE code = 'scan_batch_purposes';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'tech', 'Tech Per-User Limit', '10', 10 FROM config_categories WHERE code = 'scan_batch_user_limits';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'warehouse', 'Warehouse Per-User Limit', '20', 20 FROM config_categories WHERE code = 'scan_batch_user_limits';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'sales', 'Sales Per-User Limit', '50', 30 FROM config_categories WHERE code = 'scan_batch_user_limits';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'management', 'Management Per-User Limit', '50', 40 FROM config_categories WHERE code = 'scan_batch_user_limits';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'admin', 'Admin Per-User Limit', '100', 50 FROM config_categories WHERE code = 'scan_batch_user_limits';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'unit_type', 'Unit Type', 'unit_type', 10 FROM config_categories WHERE code = 'lot_requirement_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'manufacturer', 'Manufacturer', 'manufacturer', 20 FROM config_categories WHERE code = 'lot_requirement_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'model', 'Model', 'model', 30 FROM config_categories WHERE code = 'lot_requirement_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'processor', 'Processor', 'processor', 40 FROM config_categories WHERE code = 'lot_requirement_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'ram_gb', 'RAM GB', 'ram_gb', 50 FROM config_categories WHERE code = 'lot_requirement_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'ram_type', 'RAM Type', 'ram_type', 60 FROM config_categories WHERE code = 'lot_requirement_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'storage_gb', 'Storage GB', 'storage_gb', 70 FROM config_categories WHERE code = 'lot_requirement_types';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'storage_type', 'Storage Type', 'storage_type', 80 FROM config_categories WHERE code = 'lot_requirement_types';

INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'equals', 'Equals', 'equals', 10 FROM config_categories WHERE code = 'comparison_operators';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'in', 'In List', 'in', 20 FROM config_categories WHERE code = 'comparison_operators';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'greater_equal', 'Greater Than or Equal', 'greater_equal', 30 FROM config_categories WHERE code = 'comparison_operators';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'less_equal', 'Less Than or Equal', 'less_equal', 40 FROM config_categories WHERE code = 'comparison_operators';
INSERT INTO config_values (config_category_id, code, label, value, sort_order)
SELECT config_category_id, 'contains', 'Contains', 'contains', 50 FROM config_categories WHERE code = 'comparison_operators';

-- Starter manufacturers.
INSERT INTO manufacturers (code, name) VALUES
('dell', 'Dell'),
('hp', 'HP'),
('lenovo', 'Lenovo'),
('apple', 'Apple'),
('acer', 'Acer'),
('asus', 'Asus'),
('microsoft', 'Microsoft');

-- Starter processor brands.
INSERT INTO processor_brands (code, name) VALUES
('intel', 'Intel'),
('amd', 'AMD'),
('apple', 'Apple');

-- Views.
CREATE OR REPLACE VIEW unit_asset_tags AS
SELECT
  unit_id,
  asset_number,
  CONCAT('bwt', LPAD(asset_number, 10, '0')) AS display_asset_tag
FROM units;

CREATE OR REPLACE VIEW tech_daily_productivity AS
SELECT
  pe.user_id,
  DATE(pe.credited_at) AS productivity_date,
  SUM(CASE WHEN pt.code = 'full_unit' THEN pe.productivity_units ELSE 0 END) AS full_unit_productivity,
  SUM(CASE WHEN pt.code = 'support' THEN pe.productivity_units ELSE 0 END) AS support_productivity,
  SUM(CASE WHEN pt.code = 'qc' THEN pe.productivity_units ELSE 0 END) AS qc_productivity,
  SUM(pe.productivity_units) AS weighted_productivity
FROM productivity_events pe
JOIN config_values pt
  ON pt.config_value_id = pe.productivity_type_config_value_id
GROUP BY pe.user_id, DATE(pe.credited_at);
