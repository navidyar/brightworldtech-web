DROP PROCEDURE IF EXISTS apply_stage_10m_operational_option_usage_rankings;

DELIMITER //
CREATE PROCEDURE apply_stage_10m_operational_option_usage_rankings()
BEGIN
  DECLARE table_count INT DEFAULT 0;
  DECLARE row_count BIGINT DEFAULT 0;
  DECLARE required_column_count INT DEFAULT 0;
  DECLARE index_count INT DEFAULT 0;

  SELECT COUNT(*) INTO table_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operational_option_usage_rankings';

  IF table_count = 1 THEN
    SELECT COUNT(*) INTO row_count FROM operational_option_usage_rankings;

    SELECT COUNT(DISTINCT COLUMN_NAME) INTO required_column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_rankings'
      AND COLUMN_NAME IN (
        'option_scope', 'option_key', 'context_scope', 'context_key',
        'lifetime_count', 'count_90d', 'count_30d', 'weighted_score',
        'last_selected_at', 'refreshed_at'
      );

    SELECT COUNT(DISTINCT INDEX_NAME) INTO index_count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_rankings'
      AND INDEX_NAME IN (
        'PRIMARY',
        'idx_operational_option_rankings_scope_score',
        'idx_operational_option_rankings_refreshed'
      );

    IF required_column_count <> 10 OR index_count <> 3 THEN
      IF row_count = 0 THEN
        DROP TABLE operational_option_usage_rankings;
        SET table_count = 0;
      ELSE
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Existing operational_option_usage_rankings is incompatible and contains rows; refusing destructive replacement.';
      END IF;
    END IF;
  END IF;

  CREATE TABLE IF NOT EXISTS operational_option_usage_rankings (
    option_scope VARCHAR(64) NOT NULL,
    option_key VARCHAR(191) NOT NULL,
    context_scope VARCHAR(64) NOT NULL DEFAULT 'global',
    context_key VARCHAR(191) NOT NULL DEFAULT '0',
    lifetime_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    count_90d BIGINT UNSIGNED NOT NULL DEFAULT 0,
    count_30d BIGINT UNSIGNED NOT NULL DEFAULT 0,
    weighted_score BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_selected_at DATETIME(6) NULL,
    refreshed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (option_scope, option_key, context_scope, context_key),
    KEY idx_operational_option_rankings_scope_score (
      option_scope,
      context_scope,
      context_key,
      weighted_score DESC,
      option_key
    ),
    KEY idx_operational_option_rankings_refreshed (refreshed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  SELECT COUNT(*) INTO table_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'operational_option_usage_refresh_state';

  IF table_count = 1 THEN
    SELECT COUNT(*) INTO row_count FROM operational_option_usage_refresh_state;

    SELECT COUNT(DISTINCT COLUMN_NAME) INTO required_column_count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_refresh_state'
      AND COLUMN_NAME IN (
        'refresh_key', 'status', 'started_at', 'completed_at',
        'duration_ms', 'ranking_row_count', 'last_error', 'updated_at'
      );

    SELECT COUNT(DISTINCT INDEX_NAME) INTO index_count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operational_option_usage_refresh_state'
      AND INDEX_NAME = 'PRIMARY';

    IF required_column_count <> 8 OR index_count <> 1 THEN
      IF row_count = 0 THEN
        DROP TABLE operational_option_usage_refresh_state;
        SET table_count = 0;
      ELSE
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Existing operational_option_usage_refresh_state is incompatible and contains rows; refusing destructive replacement.';
      END IF;
    END IF;
  END IF;

  CREATE TABLE IF NOT EXISTS operational_option_usage_refresh_state (
    refresh_key VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'idle',
    started_at DATETIME(6) NULL,
    completed_at DATETIME(6) NULL,
    duration_ms INT UNSIGNED NULL,
    ranking_row_count INT UNSIGNED NULL,
    last_error VARCHAR(2000) NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (refresh_key),
    CONSTRAINT chk_operational_option_refresh_status
      CHECK (status IN ('idle', 'running', 'complete', 'failed'))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  INSERT INTO operational_option_usage_refresh_state (
    refresh_key,
    status,
    started_at,
    completed_at,
    duration_ms,
    ranking_row_count,
    last_error
  )
  VALUES ('operational_options', 'idle', NULL, NULL, NULL, 0, NULL)
  ON DUPLICATE KEY UPDATE refresh_key = VALUES(refresh_key);
END//
DELIMITER ;

CALL apply_stage_10m_operational_option_usage_rankings();
DROP PROCEDURE apply_stage_10m_operational_option_usage_rankings;
