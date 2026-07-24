-- Lots-Controlled Unit Form — Stage 4.5
-- Makes the database-level default for newly inserted Lots hidden.
-- Existing Lot rows are not changed.

ALTER TABLE lots
  MODIFY COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0;

SELECT 'Stage 4.5 new Lots hidden-by-default migration complete' AS message;
