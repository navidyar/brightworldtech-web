ALTER TABLE unit_override_requests
  ADD COLUMN requested_destination_lot_id INT DEFAULT NULL AFTER lot_id,
  ADD KEY idx_unit_override_requests_requested_destination (requested_destination_lot_id),
  ADD CONSTRAINT fk_unit_override_requests_requested_destination
    FOREIGN KEY (requested_destination_lot_id) REFERENCES lots (lot_id) ON DELETE SET NULL;

UPDATE unit_override_requests
SET requested_destination_lot_id = lot_id
WHERE request_type = 'manual_tech_override_request'
  AND requested_destination_lot_id IS NULL
  AND lot_id IS NOT NULL;
