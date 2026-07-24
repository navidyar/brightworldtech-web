-- Lots-Controlled Unit Form — Stage 4.5 rollback
-- Restores the previous database-level default for newly inserted Lots.
-- Existing Lot rows are not changed.

ALTER TABLE lots
  MODIFY COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;

SELECT 'Stage 4.5 new Lots hidden-by-default rollback complete' AS message;
