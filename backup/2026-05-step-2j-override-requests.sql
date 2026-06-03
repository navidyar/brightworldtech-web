CREATE TABLE IF NOT EXISTS unit_override_requests (
  unit_override_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_id BIGINT NULL,
  lot_id INT NULL,
  request_type VARCHAR(75) NOT NULL DEFAULT 'lot_requirement_override',
  request_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  validation_status VARCHAR(30) NULL,
  enforcement_decision VARCHAR(30) NULL,
  reason TEXT NOT NULL,
  request_details JSON NULL,
  requested_by_user_id INT NOT NULL,
  reviewed_by_user_id INT NULL,
  review_notes TEXT NULL,
  reviewed_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (unit_override_request_id),
  INDEX idx_unit_override_requests_status_created (request_status, created_at),
  INDEX idx_unit_override_requests_unit (unit_id),
  INDEX idx_unit_override_requests_lot (lot_id),
  INDEX idx_unit_override_requests_requested_by (requested_by_user_id),
  INDEX idx_unit_override_requests_reviewed_by (reviewed_by_user_id),
  CONSTRAINT fk_unit_override_requests_unit
    FOREIGN KEY (unit_id) REFERENCES units (unit_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_unit_override_requests_lot
    FOREIGN KEY (lot_id) REFERENCES lots (lot_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_unit_override_requests_requested_by
    FOREIGN KEY (requested_by_user_id) REFERENCES users (user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_override_requests_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users (user_id)
    ON DELETE SET NULL
);