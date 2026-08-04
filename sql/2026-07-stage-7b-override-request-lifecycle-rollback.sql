ALTER TABLE unit_override_requests
  DROP FOREIGN KEY fk_unit_override_requests_requested_destination,
  DROP INDEX idx_unit_override_requests_requested_destination,
  DROP COLUMN requested_destination_lot_id;
