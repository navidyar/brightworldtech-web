-- Step 7e.3: Shared Unit Requests foundation
-- This first request type is Intentional Duplicate. The schema is deliberately shared so
-- later catalog-addition requests use the same requester/reviewer/event workflow.

CREATE TABLE IF NOT EXISTS unit_requests (
  unit_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_type VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_by_user_id INT NOT NULL,
  reviewed_by_user_id INT NULL,
  requester_note VARCHAR(1000) NOT NULL,
  reviewer_note VARCHAR(1000) NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (unit_request_id),
  KEY idx_unit_requests_review_queue (request_type, status, submitted_at),
  KEY idx_unit_requests_requester (requested_by_user_id, status, submitted_at),
  CONSTRAINT fk_unit_requests_requested_by_user
    FOREIGN KEY (requested_by_user_id)
    REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_requests_reviewed_by_user
    FOREIGN KEY (reviewed_by_user_id)
    REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS unit_duplicate_requests (
  unit_duplicate_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_request_id BIGINT UNSIGNED NOT NULL,
  matched_unit_id BIGINT NOT NULL,
  requested_destination_lot_id INT NOT NULL,
  created_unit_id BIGINT NULL,
  intake_snapshot_json JSON NOT NULL,
  matched_unit_snapshot_json JSON NOT NULL,
  PRIMARY KEY (unit_duplicate_request_id),
  UNIQUE KEY uq_unit_duplicate_requests_request (unit_request_id),
  KEY idx_unit_duplicate_requests_match (matched_unit_id, requested_destination_lot_id),
  KEY idx_unit_duplicate_requests_created_unit (created_unit_id),
  CONSTRAINT fk_unit_duplicate_requests_request
    FOREIGN KEY (unit_request_id)
    REFERENCES unit_requests (unit_request_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_unit_duplicate_requests_matched_unit
    FOREIGN KEY (matched_unit_id)
    REFERENCES units (unit_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_duplicate_requests_destination_lot
    FOREIGN KEY (requested_destination_lot_id)
    REFERENCES lots (lot_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_duplicate_requests_created_unit
    FOREIGN KEY (created_unit_id)
    REFERENCES units (unit_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS unit_request_events (
  unit_request_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_request_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  performed_by_user_id INT NOT NULL,
  event_note VARCHAR(1000) NULL,
  event_details_json JSON NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (unit_request_event_id),
  KEY idx_unit_request_events_request (unit_request_id, occurred_at),
  CONSTRAINT fk_unit_request_events_request
    FOREIGN KEY (unit_request_id)
    REFERENCES unit_requests (unit_request_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_unit_request_events_user
    FOREIGN KEY (performed_by_user_id)
    REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Step 7e.3 Unit Requests and Intentional Duplicate migration complete' AS message;
