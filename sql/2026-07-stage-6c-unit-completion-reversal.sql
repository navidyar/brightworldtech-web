ALTER TABLE unit_work_completions
  DROP INDEX uniq_unit_work_completions_cycle,
  ADD COLUMN reversed_at DATETIME(6) DEFAULT NULL AFTER completed_at,
  ADD COLUMN reversed_by_user_id INT DEFAULT NULL AFTER reversed_at,
  ADD COLUMN reversal_reason TEXT DEFAULT NULL AFTER reversed_by_user_id,
  ADD COLUMN active_work_cycle_key VARCHAR(191)
    GENERATED ALWAYS AS (
      CASE
        WHEN reversed_at IS NULL THEN work_cycle_key
        ELSE NULL
      END
    ) STORED AFTER work_cycle_key,
  ADD UNIQUE KEY uniq_unit_work_completions_active_cycle (active_work_cycle_key),
  ADD KEY idx_unit_work_completions_reversed_at (reversed_at),
  ADD KEY fk_unit_work_completions_reversed_by (reversed_by_user_id),
  ADD CONSTRAINT fk_unit_work_completions_reversed_by
    FOREIGN KEY (reversed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL;
