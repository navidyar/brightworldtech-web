/*
  Step 6f.0 — Unit assignment and completion-credit foundation

  Purpose:
  - Separate current unit assignment from historical record creator.
  - Record production credit as immutable completion events.
  - Preserve dashboard credit after unit transfers, lot moves, parking, or unassignment.
  - Allow override approval to optionally credit the prior Tech with an intentional custom weight.
*/

SET @database_name = DATABASE();

/* Current assignment fields on units. */
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'assigned_to_user_id'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN assigned_to_user_id INT NULL AFTER created_by_user_id',
  'SELECT ''units.assigned_to_user_id already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'assigned_at'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN assigned_at DATETIME NULL AFTER assigned_to_user_id',
  'SELECT ''units.assigned_at already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'assignment_updated_by_user_id'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN assignment_updated_by_user_id INT NULL AFTER assigned_at',
  'SELECT ''units.assignment_updated_by_user_id already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND INDEX_NAME = 'idx_units_assigned_to_user'
);
SET @sql = IF(
  @index_exists = 0,
  'ALTER TABLE units ADD INDEX idx_units_assigned_to_user (assigned_to_user_id)',
  'SELECT ''idx_units_assigned_to_user already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

/* One-time backfill: existing units are assigned to their record creator until changed. */
UPDATE units
SET
  assigned_to_user_id = created_by_user_id,
  assigned_at = COALESCE(created_at, NOW()),
  assignment_updated_by_user_id = created_by_user_id
WHERE assigned_to_user_id IS NULL
  AND created_by_user_id IS NOT NULL;

/* Assignment history. */
CREATE TABLE IF NOT EXISTS unit_assignment_history (
  unit_assignment_history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  from_user_id INT NULL,
  to_user_id INT NULL,
  changed_by_user_id INT NULL,
  change_source VARCHAR(80) NOT NULL DEFAULT 'manual',
  override_request_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unit_assignment_history_unit (unit_id, changed_at),
  INDEX idx_unit_assignment_history_to_user (to_user_id, changed_at),
  INDEX idx_unit_assignment_history_changed_by (changed_by_user_id, changed_at),
  CONSTRAINT fk_unit_assignment_history_unit
    FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_assignment_history_from_user
    FOREIGN KEY (from_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_assignment_history_to_user
    FOREIGN KEY (to_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_assignment_history_changed_by
    FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

/* Immutable production-credit events. */
CREATE TABLE IF NOT EXISTS unit_work_completions (
  unit_work_completion_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  lot_id INT NULL,
  completed_by_user_id INT NOT NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  production_weight_value DECIMAL(5,2) NOT NULL,
  credit_source VARCHAR(80) NOT NULL DEFAULT 'manual_completion',
  recorded_by_user_id INT NULL,
  override_request_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unit_work_completions_user_date (completed_by_user_id, completed_at),
  INDEX idx_unit_work_completions_unit_date (unit_id, completed_at),
  INDEX idx_unit_work_completions_lot_date (lot_id, completed_at),
  INDEX idx_unit_work_completions_source (credit_source),
  CONSTRAINT fk_unit_work_completions_unit
    FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_work_completions_lot
    FOREIGN KEY (lot_id) REFERENCES lots (lot_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_work_completions_completed_by
    FOREIGN KEY (completed_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_unit_work_completions_recorded_by
    FOREIGN KEY (recorded_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

/* Prior-Tech optional credit on override approval. */
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'unit_override_requests'
    AND COLUMN_NAME = 'prior_tech_credit_granted'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE unit_override_requests ADD COLUMN prior_tech_credit_granted TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''unit_override_requests.prior_tech_credit_granted already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'unit_override_requests'
    AND COLUMN_NAME = 'prior_tech_credit_weight'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE unit_override_requests ADD COLUMN prior_tech_credit_weight DECIMAL(5,2) NULL',
  'SELECT ''unit_override_requests.prior_tech_credit_weight already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'unit_override_requests'
    AND COLUMN_NAME = 'prior_tech_credit_user_id'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE unit_override_requests ADD COLUMN prior_tech_credit_user_id INT NULL',
  'SELECT ''unit_override_requests.prior_tech_credit_user_id already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SELECT 'Step 6f.0 assignment and completion foundation migration complete' AS message;
