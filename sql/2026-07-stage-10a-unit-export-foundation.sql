DROP PROCEDURE IF EXISTS apply_stage_10a_unit_export_foundation;

DELIMITER //
CREATE PROCEDURE apply_stage_10a_unit_export_foundation()
BEGIN
  DECLARE battery_column_count INT DEFAULT 0;
  DECLARE short_form_column_count INT DEFAULT 0;
  DECLARE battery_constraint_count INT DEFAULT 0;

  SELECT COUNT(*) INTO battery_column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND COLUMN_NAME = 'battery_health_percent';

  IF battery_column_count = 0 THEN
    ALTER TABLE units
      ADD COLUMN battery_health_percent DECIMAL(5,1) UNSIGNED NULL;
  END IF;

  SELECT COUNT(*) INTO battery_constraint_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'units'
    AND CONSTRAINT_NAME = 'chk_units_battery_health_percent'
    AND CONSTRAINT_TYPE = 'CHECK';

  IF battery_constraint_count = 1 THEN
    ALTER TABLE units DROP CHECK chk_units_battery_health_percent;
  END IF;

  ALTER TABLE units
    MODIFY COLUMN battery_health_percent DECIMAL(5,1) UNSIGNED NULL;

  SELECT COUNT(*) INTO short_form_column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'processor_families'
    AND COLUMN_NAME = 'export_short_form';

  IF short_form_column_count = 0 THEN
    ALTER TABLE processor_families
      ADD COLUMN export_short_form VARCHAR(40) NULL;
  END IF;

  UPDATE processor_families
  SET export_short_form = CASE
    WHEN code REGEXP '^intel-i[357]-[0-9]+th-gen$'
      THEN CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX(code, '-', 2), '-', -1), '-', SUBSTRING_INDEX(SUBSTRING_INDEX(code, '-', 3), '-', -1))
    WHEN code = 'intel-core-m3-6th-gen' THEN 'm3-6th'
    WHEN code = 'intel-celeron' THEN 'Celeron'
    WHEN code = 'intel-pentium-silver' THEN 'Pentium Silver'
    WHEN code = 'intel-core-ultra-5-series-1' THEN 'Ultra 5-S1'
    WHEN code = 'intel-core-ultra-7-series-1' THEN 'Ultra 7-S1'
    WHEN code = 'intel-core-ultra-5-series-2' THEN 'Ultra 5-S2'
    WHEN code = 'intel-core-ultra-7-series-2' THEN 'Ultra 7-S2'
    WHEN code REGEXP '^amd-ryzen-[357]-[0-9]+-series$'
      THEN CONCAT(
        'R', SUBSTRING_INDEX(SUBSTRING_INDEX(code, '-', 3), '-', -1),
        '-', SUBSTRING_INDEX(SUBSTRING_INDEX(code, '-', 4), '-', -1)
      )
    WHEN code REGEXP '^apple-m[1-9]-family$'
      THEN UPPER(SUBSTRING_INDEX(SUBSTRING_INDEX(code, '-', 2), '-', -1))
    WHEN code = 'qualcomm-snapdragon-7c' THEN 'Snapdragon 7c'
    WHEN code = 'qualcomm-snapdragon-8cx' THEN 'Snapdragon 8cx'
    WHEN code = 'qualcomm-snapdragon-x' THEN 'Snapdragon X'
    WHEN code = 'mediatek-kompanio' THEN 'Kompanio'
    WHEN code = 'mediatek-mt81xx' THEN 'MT81xx'
    WHEN code = 'rockchip-rk32xx' THEN 'RK32xx'
    WHEN code = 'rockchip-rk33xx' THEN 'RK33xx'
    ELSE LEFT(code, 40)
  END
  WHERE export_short_form IS NULL OR TRIM(export_short_form) = '';

  ALTER TABLE processor_families
    MODIFY COLUMN export_short_form VARCHAR(40) NOT NULL;

  ALTER TABLE units
    ADD CONSTRAINT chk_units_battery_health_percent
    CHECK (battery_health_percent IS NULL OR battery_health_percent BETWEEN 0.0 AND 100.0);
END//
DELIMITER ;

CALL apply_stage_10a_unit_export_foundation();
DROP PROCEDURE apply_stage_10a_unit_export_foundation;
