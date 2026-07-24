-- Lots-Controlled Unit Form — Stage 2 rollback
-- Safe during Stage 2 because no live form or Lots UI reads this table yet.
-- Any rules stored after a future stage would be permanently removed by this rollback.

DROP TABLE IF EXISTS lot_unit_form_field_rules;

SELECT 'Stage 2 lot-controlled Unit form rules rollback complete' AS message;
