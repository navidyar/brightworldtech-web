DROP PROCEDURE IF EXISTS apply_stage_10d_previous_hardware_components;

DELIMITER //
CREATE PROCEDURE apply_stage_10d_previous_hardware_components()
BEGIN
  DECLARE unit_id_type VARCHAR(255) DEFAULT NULL;
  DECLARE config_value_id_type VARCHAR(255) DEFAULT NULL;
  DECLARE user_id_type VARCHAR(255) DEFAULT NULL;
  DECLARE table_count INT DEFAULT 0;
  DECLARE row_count BIGINT DEFAULT 0;
  DECLARE required_column_count INT DEFAULT 0;
  DECLARE type_mismatch_count INT DEFAULT 0;
  DECLARE index_count INT DEFAULT 0;
  DECLARE constraint_count INT DEFAULT 0;
  DECLARE check_count INT DEFAULT 0;
  DECLARE source_column_count INT DEFAULT 0;

  SELECT COLUMN_TYPE INTO unit_id_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'unit_id'
  LIMIT 1;

  SELECT COLUMN_TYPE INTO config_value_id_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'config_values'
    AND COLUMN_NAME = 'config_value_id'
  LIMIT 1;

  SELECT COLUMN_TYPE INTO user_id_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'user_id'
  LIMIT 1;

  IF unit_id_type IS NULL OR config_value_id_type IS NULL OR user_id_type IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D requires units.unit_id, config_values.config_value_id, and users.user_id.';
  END IF;

  SELECT COUNT(*) INTO table_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_memory_modules';

  IF table_count = 1 THEN
    SELECT COUNT(*) INTO row_count FROM unit_previous_memory_modules;

    SELECT COUNT(DISTINCT COLUMN_NAME) INTO required_column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_memory_modules'
      AND COLUMN_NAME IN (
        'unit_previous_memory_module_id', 'unit_id', 'sort_order', 'slot_label',
        'size_gb', 'ram_type_config_value_id', 'memory_install_type_code',
        'speed_mhz', 'manufacturer_name', 'part_number', 'serial_number',
        'change_notes', 'changed_by_user_id', 'created_at', 'updated_at'
      );

    SELECT COUNT(*) INTO type_mismatch_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_memory_modules'
      AND (
        (COLUMN_NAME = 'unit_id' AND COLUMN_TYPE <> unit_id_type)
        OR (COLUMN_NAME = 'ram_type_config_value_id' AND COLUMN_TYPE <> config_value_id_type)
        OR (COLUMN_NAME = 'changed_by_user_id' AND COLUMN_TYPE <> user_id_type)
      );

    SELECT COUNT(DISTINCT INDEX_NAME) INTO index_count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_memory_modules'
      AND INDEX_NAME IN (
        'PRIMARY',
        'idx_unit_previous_memory_modules_unit_sort',
        'idx_unit_previous_memory_modules_ram_type',
        'idx_unit_previous_memory_modules_changed_by'
      );

    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_memory_modules'
      AND CONSTRAINT_NAME IN (
        'fk_unit_previous_memory_modules_unit',
        'fk_unit_previous_memory_modules_ram_type',
        'fk_unit_previous_memory_modules_changed_by'
      );

    SELECT COUNT(*) INTO check_count
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_memory_modules'
      AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME IN (
        'chk_unit_previous_memory_modules_install_type',
        'chk_unit_previous_memory_modules_size',
        'chk_unit_previous_memory_modules_speed'
      );

    IF required_column_count <> 15
      OR type_mismatch_count > 0
      OR index_count <> 4
      OR constraint_count <> 3
      OR check_count <> 3 THEN
      IF row_count = 0 THEN
        DROP TABLE unit_previous_memory_modules;
        SET table_count = 0;
      ELSE
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Existing unit_previous_memory_modules is incompatible and contains rows; refusing destructive replacement.';
      END IF;
    END IF;
  END IF;

  SET @stage10d_memory_sql = CONCAT(
    'CREATE TABLE IF NOT EXISTS unit_previous_memory_modules (',
    'unit_previous_memory_module_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,',
    'unit_id ', unit_id_type, ' NOT NULL,',
    'sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,',
    'slot_label VARCHAR(80) NOT NULL,',
    'size_gb INT UNSIGNED NULL,',
    'ram_type_config_value_id ', config_value_id_type, ' NULL,',
    'memory_install_type_code VARCHAR(32) NULL DEFAULT NULL,',
    'speed_mhz INT UNSIGNED NULL,',
    'manufacturer_name VARCHAR(120) NULL,',
    'part_number VARCHAR(120) NULL,',
    'serial_number VARCHAR(120) NULL,',
    'change_notes VARCHAR(500) NULL,',
    'changed_by_user_id ', user_id_type, ' NULL,',
    'created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
    'updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),',
    'PRIMARY KEY (unit_previous_memory_module_id),',
    'KEY idx_unit_previous_memory_modules_unit_sort (unit_id, sort_order, unit_previous_memory_module_id),',
    'KEY idx_unit_previous_memory_modules_ram_type (ram_type_config_value_id),',
    'KEY idx_unit_previous_memory_modules_changed_by (changed_by_user_id),',
    'CONSTRAINT fk_unit_previous_memory_modules_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,',
    'CONSTRAINT fk_unit_previous_memory_modules_ram_type FOREIGN KEY (ram_type_config_value_id) REFERENCES config_values (config_value_id) ON DELETE SET NULL,',
    'CONSTRAINT fk_unit_previous_memory_modules_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL,',
    'CONSTRAINT chk_unit_previous_memory_modules_install_type CHECK (memory_install_type_code IN (''removable_module'', ''integrated_soldered'', ''unknown'')),',
    'CONSTRAINT chk_unit_previous_memory_modules_size CHECK (size_gb IS NULL OR size_gb >= 0),',
    'CONSTRAINT chk_unit_previous_memory_modules_speed CHECK (speed_mhz IS NULL OR speed_mhz > 0)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci'
  );
  PREPARE stage10d_memory_statement FROM @stage10d_memory_sql;
  EXECUTE stage10d_memory_statement;
  DEALLOCATE PREPARE stage10d_memory_statement;

  SELECT COUNT(*) INTO table_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_storage_devices';

  IF table_count = 1 THEN
    SELECT COUNT(*) INTO row_count FROM unit_previous_storage_devices;

    SELECT COUNT(DISTINCT COLUMN_NAME) INTO required_column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_storage_devices'
      AND COLUMN_NAME IN (
        'unit_previous_storage_device_id', 'unit_id', 'sort_order', 'slot_label',
        'storage_type_config_value_id', 'size_gb', 'manufacturer_name', 'model_number',
        'serial_number', 'firmware_version', 'wipe_status_config_value_id',
        'change_notes', 'changed_by_user_id', 'created_at', 'updated_at'
      );

    SELECT COUNT(*) INTO type_mismatch_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_storage_devices'
      AND (
        (COLUMN_NAME = 'unit_id' AND COLUMN_TYPE <> unit_id_type)
        OR (COLUMN_NAME = 'storage_type_config_value_id' AND COLUMN_TYPE <> config_value_id_type)
        OR (COLUMN_NAME = 'wipe_status_config_value_id' AND COLUMN_TYPE <> config_value_id_type)
        OR (COLUMN_NAME = 'changed_by_user_id' AND COLUMN_TYPE <> user_id_type)
      );

    SELECT COUNT(DISTINCT INDEX_NAME) INTO index_count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_storage_devices'
      AND INDEX_NAME IN (
        'PRIMARY',
        'idx_unit_previous_storage_devices_unit_sort',
        'idx_unit_previous_storage_devices_type',
        'idx_unit_previous_storage_devices_wipe',
        'idx_unit_previous_storage_devices_changed_by'
      );

    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_storage_devices'
      AND CONSTRAINT_NAME IN (
        'fk_unit_previous_storage_devices_unit',
        'fk_unit_previous_storage_devices_type',
        'fk_unit_previous_storage_devices_wipe',
        'fk_unit_previous_storage_devices_changed_by'
      );

    SELECT COUNT(*) INTO check_count
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_previous_storage_devices'
      AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME = 'chk_unit_previous_storage_devices_size';

    IF required_column_count <> 15
      OR type_mismatch_count > 0
      OR index_count <> 5
      OR constraint_count <> 4
      OR check_count <> 1 THEN
      IF row_count = 0 THEN
        DROP TABLE unit_previous_storage_devices;
        SET table_count = 0;
      ELSE
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Existing unit_previous_storage_devices is incompatible and contains rows; refusing destructive replacement.';
      END IF;
    END IF;
  END IF;

  SET @stage10d_storage_sql = CONCAT(
    'CREATE TABLE IF NOT EXISTS unit_previous_storage_devices (',
    'unit_previous_storage_device_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,',
    'unit_id ', unit_id_type, ' NOT NULL,',
    'sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,',
    'slot_label VARCHAR(80) NOT NULL,',
    'storage_type_config_value_id ', config_value_id_type, ' NULL,',
    'size_gb INT UNSIGNED NULL,',
    'manufacturer_name VARCHAR(120) NULL,',
    'model_number VARCHAR(120) NULL,',
    'serial_number VARCHAR(120) NULL,',
    'firmware_version VARCHAR(120) NULL,',
    'wipe_status_config_value_id ', config_value_id_type, ' NULL,',
    'change_notes VARCHAR(500) NULL,',
    'changed_by_user_id ', user_id_type, ' NULL,',
    'created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
    'updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),',
    'PRIMARY KEY (unit_previous_storage_device_id),',
    'KEY idx_unit_previous_storage_devices_unit_sort (unit_id, sort_order, unit_previous_storage_device_id),',
    'KEY idx_unit_previous_storage_devices_type (storage_type_config_value_id),',
    'KEY idx_unit_previous_storage_devices_wipe (wipe_status_config_value_id),',
    'KEY idx_unit_previous_storage_devices_changed_by (changed_by_user_id),',
    'CONSTRAINT fk_unit_previous_storage_devices_unit FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,',
    'CONSTRAINT fk_unit_previous_storage_devices_type FOREIGN KEY (storage_type_config_value_id) REFERENCES config_values (config_value_id) ON DELETE SET NULL,',
    'CONSTRAINT fk_unit_previous_storage_devices_wipe FOREIGN KEY (wipe_status_config_value_id) REFERENCES config_values (config_value_id) ON DELETE SET NULL,',
    'CONSTRAINT fk_unit_previous_storage_devices_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL,',
    'CONSTRAINT chk_unit_previous_storage_devices_size CHECK (size_gb IS NULL OR size_gb >= 0)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci'
  );
  PREPARE stage10d_storage_statement FROM @stage10d_storage_sql;
  EXECUTE stage10d_storage_statement;
  DEALLOCATE PREPARE stage10d_storage_statement;

  -- Carry forward the latest retired Current snapshot for existing Units. Dedicated
  -- Previous rows take precedence and are never overwritten on an idempotent rerun.
  SELECT COUNT(DISTINCT COLUMN_NAME) INTO source_column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_memory_modules'
    AND COLUMN_NAME IN (
      'unit_memory_module_id', 'unit_id', 'slot_label', 'size_gb',
      'ram_type_config_value_id', 'memory_install_type_code', 'speed_mhz',
      'manufacturer_name', 'part_number', 'serial_number', 'change_notes',
      'changed_by_user_id', 'is_current', 'removed_at'
    );

  IF source_column_count = 14 THEN
    SET @stage10d_memory_backfill_sql = CONCAT(
      'INSERT INTO unit_previous_memory_modules ',
      '(unit_id, sort_order, slot_label, size_gb, ram_type_config_value_id, ',
      'memory_install_type_code, speed_mhz, manufacturer_name, part_number, ',
      'serial_number, change_notes, changed_by_user_id, created_at, updated_at) ',
      'SELECT umm.unit_id, ',
      'ROW_NUMBER() OVER (PARTITION BY umm.unit_id ORDER BY umm.slot_label, umm.unit_memory_module_id), ',
      'COALESCE(NULLIF(TRIM(umm.slot_label), ''''), CONCAT(''Slot '', ROW_NUMBER() OVER (PARTITION BY umm.unit_id ORDER BY umm.slot_label, umm.unit_memory_module_id))), ',
      'umm.size_gb, umm.ram_type_config_value_id, ',
      'COALESCE(NULLIF(umm.memory_install_type_code, ''''), ''unknown''), ',
      'umm.speed_mhz, umm.manufacturer_name, umm.part_number, umm.serial_number, ',
      'umm.change_notes, umm.changed_by_user_id, ',
      'COALESCE(umm.removed_at, CURRENT_TIMESTAMP(6)), COALESCE(umm.removed_at, CURRENT_TIMESTAMP(6)) ',
      'FROM unit_memory_modules umm ',
      'INNER JOIN (SELECT unit_id, MAX(removed_at) AS latest_removed_at ',
      'FROM unit_memory_modules WHERE is_current = 0 AND removed_at IS NOT NULL GROUP BY unit_id) latest ',
      'ON latest.unit_id = umm.unit_id AND latest.latest_removed_at = umm.removed_at ',
      'WHERE umm.is_current = 0 ',
      'AND NOT EXISTS (SELECT 1 FROM unit_previous_memory_modules previous_row WHERE previous_row.unit_id = umm.unit_id)'
    );
    PREPARE stage10d_memory_backfill_statement FROM @stage10d_memory_backfill_sql;
    EXECUTE stage10d_memory_backfill_statement;
    DEALLOCATE PREPARE stage10d_memory_backfill_statement;
  END IF;

  SELECT COUNT(DISTINCT COLUMN_NAME) INTO source_column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_storage_devices'
    AND COLUMN_NAME IN (
      'unit_storage_device_id', 'unit_id', 'slot_label',
      'storage_type_config_value_id', 'size_gb', 'manufacturer_name',
      'model_number', 'serial_number', 'firmware_version',
      'wipe_status_config_value_id', 'change_notes', 'changed_by_user_id',
      'is_current', 'removed_at'
    );

  IF source_column_count = 14 THEN
    SET @stage10d_storage_backfill_sql = CONCAT(
      'INSERT INTO unit_previous_storage_devices ',
      '(unit_id, sort_order, slot_label, storage_type_config_value_id, size_gb, ',
      'manufacturer_name, model_number, serial_number, firmware_version, ',
      'wipe_status_config_value_id, change_notes, changed_by_user_id, created_at, updated_at) ',
      'SELECT usd.unit_id, ',
      'ROW_NUMBER() OVER (PARTITION BY usd.unit_id ORDER BY usd.slot_label, usd.unit_storage_device_id), ',
      'COALESCE(NULLIF(TRIM(usd.slot_label), ''''), CONCAT(''Drive '', ROW_NUMBER() OVER (PARTITION BY usd.unit_id ORDER BY usd.slot_label, usd.unit_storage_device_id))), ',
      'usd.storage_type_config_value_id, usd.size_gb, usd.manufacturer_name, ',
      'usd.model_number, usd.serial_number, usd.firmware_version, ',
      'usd.wipe_status_config_value_id, usd.change_notes, usd.changed_by_user_id, ',
      'COALESCE(usd.removed_at, CURRENT_TIMESTAMP(6)), COALESCE(usd.removed_at, CURRENT_TIMESTAMP(6)) ',
      'FROM unit_storage_devices usd ',
      'INNER JOIN (SELECT unit_id, MAX(removed_at) AS latest_removed_at ',
      'FROM unit_storage_devices WHERE is_current = 0 AND removed_at IS NOT NULL GROUP BY unit_id) latest ',
      'ON latest.unit_id = usd.unit_id AND latest.latest_removed_at = usd.removed_at ',
      'WHERE usd.is_current = 0 ',
      'AND NOT EXISTS (SELECT 1 FROM unit_previous_storage_devices previous_row WHERE previous_row.unit_id = usd.unit_id)'
    );
    PREPARE stage10d_storage_backfill_statement FROM @stage10d_storage_backfill_sql;
    EXECUTE stage10d_storage_backfill_statement;
    DEALLOCATE PREPARE stage10d_storage_backfill_statement;
  END IF;

  SELECT COUNT(DISTINCT COLUMN_NAME) INTO required_column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_memory_modules'
    AND COLUMN_NAME IN (
      'unit_previous_memory_module_id', 'unit_id', 'sort_order', 'slot_label',
      'size_gb', 'ram_type_config_value_id', 'memory_install_type_code',
      'speed_mhz', 'manufacturer_name', 'part_number', 'serial_number',
      'change_notes', 'changed_by_user_id', 'created_at', 'updated_at'
    );
  IF required_column_count <> 15 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for unit_previous_memory_modules columns.';
  END IF;

  SELECT COUNT(DISTINCT INDEX_NAME) INTO index_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_memory_modules'
    AND INDEX_NAME IN (
      'PRIMARY',
      'idx_unit_previous_memory_modules_unit_sort',
      'idx_unit_previous_memory_modules_ram_type',
      'idx_unit_previous_memory_modules_changed_by'
    );
  IF index_count <> 4 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for Previous Memory indexes.';
  END IF;

  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_memory_modules'
    AND CONSTRAINT_NAME IN (
      'fk_unit_previous_memory_modules_unit',
      'fk_unit_previous_memory_modules_ram_type',
      'fk_unit_previous_memory_modules_changed_by'
    );
  IF constraint_count <> 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for Previous Memory foreign keys.';
  END IF;

  SELECT COUNT(*) INTO check_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_memory_modules'
    AND CONSTRAINT_TYPE = 'CHECK'
    AND CONSTRAINT_NAME IN (
      'chk_unit_previous_memory_modules_install_type',
      'chk_unit_previous_memory_modules_size',
      'chk_unit_previous_memory_modules_speed'
    );
  IF check_count <> 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for Previous Memory checks.';
  END IF;

  SELECT COUNT(DISTINCT COLUMN_NAME) INTO required_column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_storage_devices'
    AND COLUMN_NAME IN (
      'unit_previous_storage_device_id', 'unit_id', 'sort_order', 'slot_label',
      'storage_type_config_value_id', 'size_gb', 'manufacturer_name', 'model_number',
      'serial_number', 'firmware_version', 'wipe_status_config_value_id',
      'change_notes', 'changed_by_user_id', 'created_at', 'updated_at'
    );
  IF required_column_count <> 15 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for unit_previous_storage_devices columns.';
  END IF;

  SELECT COUNT(DISTINCT INDEX_NAME) INTO index_count
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_storage_devices'
    AND INDEX_NAME IN (
      'PRIMARY',
      'idx_unit_previous_storage_devices_unit_sort',
      'idx_unit_previous_storage_devices_type',
      'idx_unit_previous_storage_devices_wipe',
      'idx_unit_previous_storage_devices_changed_by'
    );
  IF index_count <> 5 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for Previous Storage indexes.';
  END IF;

  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_storage_devices'
    AND CONSTRAINT_NAME IN (
      'fk_unit_previous_storage_devices_unit',
      'fk_unit_previous_storage_devices_type',
      'fk_unit_previous_storage_devices_wipe',
      'fk_unit_previous_storage_devices_changed_by'
    );
  IF constraint_count <> 4 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for Previous Storage foreign keys.';
  END IF;

  SELECT COUNT(*) INTO check_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'unit_previous_storage_devices'
    AND CONSTRAINT_TYPE = 'CHECK'
    AND CONSTRAINT_NAME = 'chk_unit_previous_storage_devices_size';
  IF check_count <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stage 10D verification failed for Previous Storage checks.';
  END IF;
END//
DELIMITER ;

CALL apply_stage_10d_previous_hardware_components();
DROP PROCEDURE apply_stage_10d_previous_hardware_components;
