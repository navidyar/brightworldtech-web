DELIMITER //
CREATE PROCEDURE rollback_stage_6c_completion_reversal()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unit_work_completions
    WHERE work_cycle_key IS NOT NULL
    GROUP BY work_cycle_key
    HAVING COUNT(*) > 1
    LIMIT 1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 6C rollback is unsafe after a completion has been undone and recorded again in the same Lot stay.';
  END IF;
END//
DELIMITER ;

CALL rollback_stage_6c_completion_reversal();
DROP PROCEDURE rollback_stage_6c_completion_reversal;

ALTER TABLE unit_work_completions
  DROP FOREIGN KEY fk_unit_work_completions_reversed_by,
  DROP INDEX fk_unit_work_completions_reversed_by,
  DROP INDEX idx_unit_work_completions_reversed_at,
  DROP INDEX uniq_unit_work_completions_active_cycle,
  DROP COLUMN active_work_cycle_key,
  DROP COLUMN reversal_reason,
  DROP COLUMN reversed_by_user_id,
  DROP COLUMN reversed_at,
  ADD UNIQUE KEY uniq_unit_work_completions_cycle (work_cycle_key);
