-- Stage 10W33 — child Lot requirement inheritance suppression.
-- Adds an explicit, reversible way for a child Lot to stop inheriting one
-- requirement field from its direct parent without creating a fake requirement.

DROP PROCEDURE IF EXISTS stage10w33_install_requirement_suppressions;
DELIMITER //
CREATE PROCEDURE stage10w33_install_requirement_suppressions()
BEGIN
  DECLARE table_exists INT DEFAULT 0;
  DECLARE row_count BIGINT DEFAULT 0;
  DECLARE required_column_count INT DEFAULT 0;
  DECLARE required_unique_index_count INT DEFAULT 0;
  DECLARE required_foreign_key_count INT DEFAULT 0;

  SELECT COUNT(*)
    INTO table_exists
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lot_requirement_inheritance_suppressions';

  IF table_exists = 1 THEN
    SELECT COUNT(*)
      INTO required_column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'lot_requirement_inheritance_suppressions'
      AND COLUMN_NAME IN (
        'lot_requirement_inheritance_suppression_id',
        'lot_id',
        'requirement_type_config_value_id',
        'created_by_user_id',
        'updated_by_user_id',
        'created_at',
        'updated_at'
      );

    SELECT COUNT(*)
      INTO required_unique_index_count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'lot_requirement_inheritance_suppressions'
      AND INDEX_NAME = 'uq_lot_req_inherit_suppression_lot_field'
      AND NON_UNIQUE = 0;

    SELECT COUNT(*)
      INTO required_foreign_key_count
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'lot_requirement_inheritance_suppressions'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      AND CONSTRAINT_NAME IN (
        'fk_lot_req_inherit_suppression_lot',
        'fk_lot_req_inherit_suppression_req_type',
        'fk_lot_req_inherit_suppression_created_by',
        'fk_lot_req_inherit_suppression_updated_by'
      );

    IF required_column_count <> 7 OR required_unique_index_count = 0 OR required_foreign_key_count <> 4 THEN
      SELECT COUNT(*) INTO row_count
      FROM lot_requirement_inheritance_suppressions;

      IF row_count > 0 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Stage 10W33 found an incompatible non-empty lot_requirement_inheritance_suppressions table. Migration stopped without destructive changes.';
      END IF;

      DROP TABLE lot_requirement_inheritance_suppressions;
      SET table_exists = 0;
    END IF;
  END IF;

  IF table_exists = 0 THEN
    CREATE TABLE lot_requirement_inheritance_suppressions (
      lot_requirement_inheritance_suppression_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lot_id INT NOT NULL,
      requirement_type_config_value_id INT NOT NULL,
      created_by_user_id INT NULL,
      updated_by_user_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (lot_requirement_inheritance_suppression_id),
      UNIQUE KEY uq_lot_req_inherit_suppression_lot_field (lot_id, requirement_type_config_value_id),
      KEY idx_lot_req_inherit_suppression_req_type (requirement_type_config_value_id, lot_id),
      KEY idx_lot_req_inherit_suppression_created_by (created_by_user_id),
      KEY idx_lot_req_inherit_suppression_updated_by (updated_by_user_id),
      CONSTRAINT fk_lot_req_inherit_suppression_lot
        FOREIGN KEY (lot_id)
        REFERENCES lots (lot_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
      CONSTRAINT fk_lot_req_inherit_suppression_req_type
        FOREIGN KEY (requirement_type_config_value_id)
        REFERENCES config_values (config_value_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
      CONSTRAINT fk_lot_req_inherit_suppression_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users (user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
      CONSTRAINT fk_lot_req_inherit_suppression_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES users (user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  SELECT COUNT(*)
    INTO required_column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lot_requirement_inheritance_suppressions'
    AND COLUMN_NAME IN (
      'lot_requirement_inheritance_suppression_id',
      'lot_id',
      'requirement_type_config_value_id',
      'created_by_user_id',
      'updated_by_user_id',
      'created_at',
      'updated_at'
    );

  SELECT COUNT(*)
    INTO required_unique_index_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lot_requirement_inheritance_suppressions'
    AND INDEX_NAME = 'uq_lot_req_inherit_suppression_lot_field'
    AND NON_UNIQUE = 0;

  SELECT COUNT(*)
    INTO required_foreign_key_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lot_requirement_inheritance_suppressions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME IN (
      'fk_lot_req_inherit_suppression_lot',
      'fk_lot_req_inherit_suppression_req_type',
      'fk_lot_req_inherit_suppression_created_by',
      'fk_lot_req_inherit_suppression_updated_by'
    );

  IF required_column_count <> 7 OR required_unique_index_count = 0 OR required_foreign_key_count <> 4 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10W33 could not verify the requirement inheritance suppression schema.';
  END IF;
END//
DELIMITER ;

CALL stage10w33_install_requirement_suppressions();
DROP PROCEDURE stage10w33_install_requirement_suppressions;

SELECT
  TABLE_NAME,
  ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lot_requirement_inheritance_suppressions';

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lot_requirement_inheritance_suppressions'
ORDER BY ORDINAL_POSITION;
