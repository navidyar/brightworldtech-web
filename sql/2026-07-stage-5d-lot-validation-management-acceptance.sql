INSERT INTO config_values (
  config_category_id,
  code,
  label,
  value,
  sort_order,
  is_active
)
SELECT
  category.config_category_id,
  'cancelled',
  'Cancelled',
  'cancelled',
  40,
  1
FROM config_categories category
WHERE category.code = 'override_statuses'
  AND NOT EXISTS (
    SELECT 1
    FROM config_values existing_value
    WHERE existing_value.config_category_id = category.config_category_id
      AND existing_value.code = 'cancelled'
  );

INSERT INTO config_values (
  config_category_id,
  code,
  label,
  value,
  sort_order,
  is_active
)
SELECT
  category.config_category_id,
  'expired',
  'Expired',
  'expired',
  50,
  1
FROM config_categories category
WHERE category.code = 'override_statuses'
  AND NOT EXISTS (
    SELECT 1
    FROM config_values existing_value
    WHERE existing_value.config_category_id = category.config_category_id
      AND existing_value.code = 'expired'
  );

ALTER TABLE unit_lot_validation_overrides
  ADD COLUMN requirement_signature CHAR(64) NULL AFTER reason,
  ADD COLUMN lot_assignment_signature CHAR(64) NULL AFTER requirement_signature,
  ADD COLUMN revoked_by_user_id INT NULL AFTER denied_at,
  ADD COLUMN revoked_at DATETIME NULL AFTER revoked_by_user_id,
  ADD COLUMN expired_at DATETIME NULL AFTER revoked_at,
  ADD KEY idx_unit_lot_validation_overrides_active_signature (
    lot_id,
    unit_id,
    override_status_config_value_id,
    requirement_signature,
    lot_assignment_signature
  ),
  ADD KEY fk_unit_lot_validation_overrides_revoked_by (revoked_by_user_id),
  ADD CONSTRAINT fk_unit_lot_validation_overrides_revoked_by
    FOREIGN KEY (revoked_by_user_id) REFERENCES users (user_id);
