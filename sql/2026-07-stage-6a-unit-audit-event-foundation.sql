CREATE TABLE IF NOT EXISTS unit_audit_events (
  unit_audit_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_id BIGINT NOT NULL,
  actor_user_id INT DEFAULT NULL,
  event_type VARCHAR(80) NOT NULL,
  event_source VARCHAR(80) NOT NULL DEFAULT 'application',
  event_summary VARCHAR(255) NOT NULL,
  correlation_key CHAR(36) NOT NULL,
  event_metadata_json JSON DEFAULT NULL,
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (unit_audit_event_id),
  UNIQUE KEY uq_unit_audit_events_correlation (correlation_key),
  KEY idx_unit_audit_events_unit_time (unit_id, occurred_at, unit_audit_event_id),
  KEY idx_unit_audit_events_actor_time (actor_user_id, occurred_at),
  KEY idx_unit_audit_events_type_time (event_type, occurred_at),
  CONSTRAINT fk_unit_audit_events_unit
    FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_audit_events_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unit_audit_event_changes (
  unit_audit_event_change_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_audit_event_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(120) NOT NULL,
  field_label VARCHAR(150) NOT NULL,
  change_type VARCHAR(40) NOT NULL,
  old_value_text MEDIUMTEXT DEFAULT NULL,
  new_value_text MEDIUMTEXT DEFAULT NULL,
  old_value_json JSON DEFAULT NULL,
  new_value_json JSON DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (unit_audit_event_change_id),
  UNIQUE KEY uq_unit_audit_event_changes_field (unit_audit_event_id, field_key),
  KEY idx_unit_audit_event_changes_event_order (unit_audit_event_id, sort_order, unit_audit_event_change_id),
  KEY idx_unit_audit_event_changes_field (field_key),
  CONSTRAINT fk_unit_audit_event_changes_event
    FOREIGN KEY (unit_audit_event_id)
    REFERENCES unit_audit_events (unit_audit_event_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
