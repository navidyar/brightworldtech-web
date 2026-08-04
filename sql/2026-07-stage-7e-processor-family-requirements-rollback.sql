-- Stage 7E rollback. Run only after confirming no Lot requirement references a Processor Family.

DROP PROCEDURE IF EXISTS bwt_stage7e_drop_processor_family_requirement_column;
DELIMITER //
CREATE PROCEDURE bwt_stage7e_drop_processor_family_requirement_column()
BEGIN
  DECLARE has_column INT DEFAULT 0;
  DECLARE has_fk INT DEFAULT 0;
  DECLARE has_index INT DEFAULT 0;

  SELECT COUNT(*) INTO has_column
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'lot_requirements'
    AND column_name = 'processor_family_id';

  IF has_column > 0 THEN
    SELECT COUNT(*) INTO has_fk
    FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'lot_requirements'
      AND constraint_name = 'fk_lot_requirements_processor_family';

    IF has_fk > 0 THEN
      ALTER TABLE lot_requirements DROP FOREIGN KEY fk_lot_requirements_processor_family;
    END IF;

    SELECT COUNT(*) INTO has_index
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'lot_requirements'
      AND index_name = 'idx_lot_requirements_processor_family';

    IF has_index > 0 THEN
      ALTER TABLE lot_requirements DROP INDEX idx_lot_requirements_processor_family;
    END IF;

    ALTER TABLE lot_requirements DROP COLUMN processor_family_id;
  END IF;
END//
DELIMITER ;

CALL bwt_stage7e_drop_processor_family_requirement_column();
DROP PROCEDURE bwt_stage7e_drop_processor_family_requirement_column;

DELETE cv
FROM config_values cv
INNER JOIN config_categories cc
  ON cc.config_category_id = cv.config_category_id
WHERE cc.code = 'lot_requirement_types'
  AND cv.code = 'processor_family';

DROP TABLE IF EXISTS processor_family_members;
DROP TABLE IF EXISTS processor_families;

SELECT 'Stage 7E Processor Family requirements rollback complete' AS message;
