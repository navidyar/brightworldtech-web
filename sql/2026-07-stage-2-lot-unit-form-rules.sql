-- Lots-Controlled Unit Form — Stage 2
-- Adds storage for per-lot Unit form visibility and requirement overrides.
-- This migration does not add any rules and does not connect the table to the live Unit form.

CREATE TABLE IF NOT EXISTS lot_unit_form_field_rules (
  lot_unit_form_field_rule_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lot_id INT NOT NULL,
  field_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  visibility_mode ENUM('inherit', 'visible', 'hidden') NOT NULL DEFAULT 'inherit',
  requirement_mode ENUM('inherit', 'required', 'optional') NOT NULL DEFAULT 'inherit',
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (lot_unit_form_field_rule_id),
  UNIQUE KEY uq_lot_unit_form_field_rules_lot_field (lot_id, field_key),
  KEY idx_lot_unit_form_field_rules_field (field_key, lot_id),
  KEY idx_lot_unit_form_field_rules_created_by (created_by_user_id),
  KEY idx_lot_unit_form_field_rules_updated_by (updated_by_user_id),
  CONSTRAINT fk_lot_unit_form_field_rules_lot
    FOREIGN KEY (lot_id)
    REFERENCES lots (lot_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_lot_unit_form_field_rules_created_by
    FOREIGN KEY (created_by_user_id)
    REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_lot_unit_form_field_rules_updated_by
    FOREIGN KEY (updated_by_user_id)
    REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_lot_unit_form_field_rules_has_override
    CHECK (visibility_mode <> 'inherit' OR requirement_mode <> 'inherit'),
  CONSTRAINT chk_lot_unit_form_field_rules_hidden_not_required
    CHECK (NOT (visibility_mode = 'hidden' AND requirement_mode = 'required'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Stage 2 lot-controlled Unit form rules migration complete' AS message;
