ALTER TABLE unit_lot_validation_overrides
  DROP FOREIGN KEY fk_unit_lot_validation_overrides_revoked_by,
  DROP INDEX fk_unit_lot_validation_overrides_revoked_by,
  DROP INDEX idx_unit_lot_validation_overrides_active_signature,
  DROP COLUMN expired_at,
  DROP COLUMN revoked_at,
  DROP COLUMN revoked_by_user_id,
  DROP COLUMN lot_assignment_signature,
  DROP COLUMN requirement_signature;
