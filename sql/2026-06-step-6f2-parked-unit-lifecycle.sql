/*
  Step 6f.2 — Parked Unit Lifecycle

  Purpose:
  - Replace the prior one-way archive behavior with explicit Active / Parked state.
  - Preserve historical lot, assignment, unit-detail, and earned-credit records.
  - Clear only the unit's current operational lot and assignment while parked.
  - Convert previously archived units into parked units once, retaining their final known state in lifecycle history.

  Run after:
  - Step 6f (legacy archive columns)
  - Step 6f.0 (assignment and immutable completion foundation)
  - Step 6f.1 (closed lot lifecycle)
*/

SET @database_name = DATABASE();

/* Explicit parked-state fields. */
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'units' AND COLUMN_NAME = 'is_parked'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN is_parked TINYINT(1) NOT NULL DEFAULT 0 AFTER is_archived',
  'SELECT ''units.is_parked already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'units' AND COLUMN_NAME = 'parked_at'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN parked_at DATETIME NULL AFTER is_parked',
  'SELECT ''units.parked_at already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'units' AND COLUMN_NAME = 'parked_by_user_id'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE units ADD COLUMN parked_by_user_id INT NULL AFTER parked_at',
  'SELECT ''units.parked_by_user_id already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @database_name AND TABLE_NAME = 'units' AND INDEX_NAME = 'idx_units_parked_visibility'
);
SET @sql = IF(
  @index_exists = 0,
  'ALTER TABLE units ADD INDEX idx_units_parked_visibility (is_parked, updated_at)',
  'SELECT ''idx_units_parked_visibility already exists'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

/*
  Parked units intentionally have no current operational lot.
  Keep the legacy/current column type while permitting the NULL state used by Park.
*/
SET @lot_id_requires_nullable_change = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @database_name
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'lot_id'
    AND IS_NULLABLE = 'NO'
);
SET @sql = IF(
  @lot_id_requires_nullable_change > 0,
  'ALTER TABLE units MODIFY COLUMN lot_id INT NULL',
  'SELECT ''units.lot_id already allows NULL'' AS message'
);
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

/* Lifecycle history is separate from current units values and preserves transitions. */
CREATE TABLE IF NOT EXISTS unit_park_history (
  unit_park_history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  unit_id BIGINT NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  from_lot_id INT NULL,
  to_lot_id INT NULL,
  from_assigned_to_user_id INT NULL,
  to_assigned_to_user_id INT NULL,
  changed_by_user_id INT NULL,
  notes TEXT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unit_park_history_unit_date (unit_id, changed_at),
  INDEX idx_unit_park_history_event_date (event_type, changed_at),
  CONSTRAINT fk_unit_park_history_unit
    FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_park_history_from_lot
    FOREIGN KEY (from_lot_id) REFERENCES lots (lot_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_park_history_to_lot
    FOREIGN KEY (to_lot_id) REFERENCES lots (lot_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_park_history_from_user
    FOREIGN KEY (from_assigned_to_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_park_history_to_user
    FOREIGN KEY (to_assigned_to_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_unit_park_history_changed_by
    FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

/*
  One-time legacy conversion.
  Capture legacy archive context before current lot and assignment are cleared.
  The INSERT is idempotent: a legacy conversion event is created once per unit.
*/
INSERT INTO unit_park_history (
  unit_id,
  event_type,
  from_lot_id,
  to_lot_id,
  from_assigned_to_user_id,
  to_assigned_to_user_id,
  changed_by_user_id,
  notes,
  changed_at
)
SELECT
  u.unit_id,
  'parked',
  u.lot_id,
  NULL,
  u.assigned_to_user_id,
  NULL,
  COALESCE(archived_by.user_id, created_by.user_id),
  'Legacy archived unit converted to the Step 6f.2 Parked lifecycle.',
  COALESCE(u.archived_at, u.updated_at, u.created_at, NOW())
FROM units u
LEFT JOIN users archived_by
  ON archived_by.user_id = u.archived_by_user_id
LEFT JOIN users created_by
  ON created_by.user_id = u.created_by_user_id
WHERE COALESCE(u.is_archived, 0) = 1
  AND COALESCE(u.is_parked, 0) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM unit_park_history history_check
    WHERE history_check.unit_id = u.unit_id
      AND history_check.notes = 'Legacy archived unit converted to the Step 6f.2 Parked lifecycle.'
  );

/* Preserve the assignment transition in the existing assignment-history ledger when available. */
INSERT INTO unit_assignment_history (
  unit_id,
  from_user_id,
  to_user_id,
  changed_by_user_id,
  change_source,
  notes,
  changed_at
)
SELECT
  u.unit_id,
  u.assigned_to_user_id,
  NULL,
  COALESCE(archived_by.user_id, created_by.user_id),
  'legacy_archive_conversion',
  'Assignment cleared while converting the legacy archived unit to Parked.',
  COALESCE(u.archived_at, u.updated_at, u.created_at, NOW())
FROM units u
LEFT JOIN users archived_by
  ON archived_by.user_id = u.archived_by_user_id
LEFT JOIN users created_by
  ON created_by.user_id = u.created_by_user_id
WHERE COALESCE(u.is_archived, 0) = 1
  AND COALESCE(u.is_parked, 0) = 0
  AND u.assigned_to_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM unit_assignment_history assignment_check
    WHERE assignment_check.unit_id = u.unit_id
      AND assignment_check.change_source = 'legacy_archive_conversion'
  );

/* Make former archived units actually parked and remove their active lot/assignment. */
UPDATE units
SET
  is_parked = 1,
  parked_at = COALESCE(parked_at, archived_at, updated_at, created_at, NOW()),
  parked_by_user_id = COALESCE(parked_by_user_id, archived_by_user_id),
  lot_id = NULL,
  assigned_to_user_id = NULL,
  assigned_at = NULL,
  assignment_updated_by_user_id = COALESCE(archived_by_user_id, assignment_updated_by_user_id)
WHERE COALESCE(is_archived, 0) = 1
  AND COALESCE(is_parked, 0) = 0;

/*
  Legacy archive fields are intentionally retained for compatibility with the already-applied
  Step 6f schema. Application code keeps them synchronized while the user-facing lifecycle
  is now Active / Parked / Return to Active.
*/
SELECT 'Step 6f.2 parked-unit lifecycle migration complete' AS message;
