-- Stage 7E: reusable Processor Family requirements.
-- Families use explicit processor membership. Automatic classification is intentionally limited
-- to processor names whose tier and generation/series can be inferred safely.

CREATE TABLE IF NOT EXISTS processor_families (
  processor_family_id INT NOT NULL AUTO_INCREMENT,
  processor_brand_id INT NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  membership_version INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (processor_family_id),
  UNIQUE KEY uq_processor_families_code (code),
  UNIQUE KEY uq_processor_families_brand_name (processor_brand_id, name),
  KEY idx_processor_families_catalog (processor_brand_id, is_active, sort_order, name),
  CONSTRAINT fk_processor_families_brand
    FOREIGN KEY (processor_brand_id) REFERENCES processor_brands (processor_brand_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_processor_families_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_processor_families_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS processor_family_members (
  processor_family_member_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  processor_family_id INT NOT NULL,
  processor_model_id INT NOT NULL,
  assignment_source ENUM('seed', 'automatic', 'manual') NOT NULL DEFAULT 'manual',
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (processor_family_member_id),
  UNIQUE KEY uq_processor_family_members_family_processor (processor_family_id, processor_model_id),
  KEY idx_processor_family_members_processor (processor_model_id, processor_family_id),
  CONSTRAINT fk_processor_family_members_family
    FOREIGN KEY (processor_family_id) REFERENCES processor_families (processor_family_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_processor_family_members_processor
    FOREIGN KEY (processor_model_id) REFERENCES processor_models (processor_model_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_processor_family_members_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_processor_family_members_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS bwt_stage7e_add_processor_family_requirement_column;
DELIMITER //
CREATE PROCEDURE bwt_stage7e_add_processor_family_requirement_column()
BEGIN
  DECLARE has_column INT DEFAULT 0;
  DECLARE has_index INT DEFAULT 0;
  DECLARE has_fk INT DEFAULT 0;

  SELECT COUNT(*) INTO has_column
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'lot_requirements'
    AND column_name = 'processor_family_id';

  IF has_column = 0 THEN
    ALTER TABLE lot_requirements
      ADD COLUMN processor_family_id INT NULL AFTER processor_model_id;
  END IF;

  SELECT COUNT(*) INTO has_index
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'lot_requirements'
    AND index_name = 'idx_lot_requirements_processor_family';

  IF has_index = 0 THEN
    ALTER TABLE lot_requirements
      ADD KEY idx_lot_requirements_processor_family (processor_family_id);
  END IF;

  SELECT COUNT(*) INTO has_fk
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'lot_requirements'
    AND constraint_name = 'fk_lot_requirements_processor_family';

  IF has_fk = 0 THEN
    ALTER TABLE lot_requirements
      ADD CONSTRAINT fk_lot_requirements_processor_family
      FOREIGN KEY (processor_family_id) REFERENCES processor_families (processor_family_id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END//
DELIMITER ;

CALL bwt_stage7e_add_processor_family_requirement_column();
DROP PROCEDURE bwt_stage7e_add_processor_family_requirement_column;

SET @lot_requirement_type_category_id = (
  SELECT config_category_id
  FROM config_categories
  WHERE code = 'lot_requirement_types'
  LIMIT 1
);

INSERT INTO config_values (
  config_category_id,
  code,
  label,
  value,
  sort_order,
  is_active
)
SELECT
  @lot_requirement_type_category_id,
  'processor_family',
  'Processor Family',
  'processor_family',
  45,
  1
WHERE @lot_requirement_type_category_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  value = VALUES(value),
  sort_order = VALUES(sort_order),
  is_active = 1;

CREATE TEMPORARY TABLE tmp_stage7e_processor_family_seed (
  brand_code VARCHAR(75) NOT NULL,
  family_code VARCHAR(100) NOT NULL,
  family_name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  sort_order INT NOT NULL
) ENGINE=Memory;

INSERT INTO tmp_stage7e_processor_family_seed (
  brand_code,
  family_code,
  family_name,
  description,
  sort_order
) VALUES
  ('intel', 'intel-i3-6th-gen', 'Intel i3-6th Gen', 'Intel Core i3 6th generation processors.', 10),
  ('intel', 'intel-i5-6th-gen', 'Intel i5-6th Gen', 'Intel Core i5 6th generation processors.', 11),
  ('intel', 'intel-i7-6th-gen', 'Intel i7-6th Gen', 'Intel Core i7 6th generation processors.', 12),
  ('intel', 'intel-i3-7th-gen', 'Intel i3-7th Gen', 'Intel Core i3 7th generation processors.', 13),
  ('intel', 'intel-i5-7th-gen', 'Intel i5-7th Gen', 'Intel Core i5 7th generation processors.', 14),
  ('intel', 'intel-i7-7th-gen', 'Intel i7-7th Gen', 'Intel Core i7 7th generation processors.', 15),
  ('intel', 'intel-i3-8th-gen', 'Intel i3-8th Gen', 'Intel Core i3 8th generation processors.', 16),
  ('intel', 'intel-i5-8th-gen', 'Intel i5-8th Gen', 'Intel Core i5 8th generation processors.', 17),
  ('intel', 'intel-i7-8th-gen', 'Intel i7-8th Gen', 'Intel Core i7 8th generation processors.', 18),
  ('intel', 'intel-i3-9th-gen', 'Intel i3-9th Gen', 'Intel Core i3 9th generation processors.', 19),
  ('intel', 'intel-i5-9th-gen', 'Intel i5-9th Gen', 'Intel Core i5 9th generation processors.', 20),
  ('intel', 'intel-i7-9th-gen', 'Intel i7-9th Gen', 'Intel Core i7 9th generation processors.', 21),
  ('intel', 'intel-i3-10th-gen', 'Intel i3-10th Gen', 'Intel Core i3 10th generation processors.', 22),
  ('intel', 'intel-i5-10th-gen', 'Intel i5-10th Gen', 'Intel Core i5 10th generation processors.', 23),
  ('intel', 'intel-i7-10th-gen', 'Intel i7-10th Gen', 'Intel Core i7 10th generation processors.', 24),
  ('intel', 'intel-i3-11th-gen', 'Intel i3-11th Gen', 'Intel Core i3 11th generation processors.', 25),
  ('intel', 'intel-i5-11th-gen', 'Intel i5-11th Gen', 'Intel Core i5 11th generation processors.', 26),
  ('intel', 'intel-i7-11th-gen', 'Intel i7-11th Gen', 'Intel Core i7 11th generation processors.', 27),
  ('intel', 'intel-i3-12th-gen', 'Intel i3-12th Gen', 'Intel Core i3 12th generation processors.', 28),
  ('intel', 'intel-i5-12th-gen', 'Intel i5-12th Gen', 'Intel Core i5 12th generation processors.', 29),
  ('intel', 'intel-i7-12th-gen', 'Intel i7-12th Gen', 'Intel Core i7 12th generation processors.', 30),
  ('intel', 'intel-i3-13th-gen', 'Intel i3-13th Gen', 'Intel Core i3 13th generation processors.', 31),
  ('intel', 'intel-i5-13th-gen', 'Intel i5-13th Gen', 'Intel Core i5 13th generation processors.', 32),
  ('intel', 'intel-i7-13th-gen', 'Intel i7-13th Gen', 'Intel Core i7 13th generation processors.', 33),
  ('intel', 'intel-core-m3-6th-gen', 'Intel Core m3-6th Gen', 'Intel Core m3 6th generation processors.', 100),
  ('intel', 'intel-celeron', 'Intel Celeron', 'Intel Celeron processors.', 110),
  ('intel', 'intel-pentium-silver', 'Intel Pentium Silver', 'Intel Pentium Silver processors.', 111),
  ('intel', 'intel-core-ultra-5-series-1', 'Intel Core Ultra 5 Series 1', 'Intel Core Ultra 5 processors with 1xx model numbers.', 120),
  ('intel', 'intel-core-ultra-7-series-1', 'Intel Core Ultra 7 Series 1', 'Intel Core Ultra 7 processors with 1xx model numbers.', 121),
  ('intel', 'intel-core-ultra-5-series-2', 'Intel Core Ultra 5 Series 2', 'Intel Core Ultra 5 processors with 2xx model numbers.', 122),
  ('intel', 'intel-core-ultra-7-series-2', 'Intel Core Ultra 7 Series 2', 'Intel Core Ultra 7 processors with 2xx model numbers.', 123),
  ('amd', 'amd-ryzen-3-2000-series', 'AMD Ryzen 3 2000 Series', 'AMD Ryzen 3 and Ryzen 3 PRO 2000-series processors.', 200),
  ('amd', 'amd-ryzen-5-2000-series', 'AMD Ryzen 5 2000 Series', 'AMD Ryzen 5 and Ryzen 5 PRO 2000-series processors.', 201),
  ('amd', 'amd-ryzen-7-2000-series', 'AMD Ryzen 7 2000 Series', 'AMD Ryzen 7 and Ryzen 7 PRO 2000-series processors.', 202),
  ('amd', 'amd-ryzen-3-3000-series', 'AMD Ryzen 3 3000 Series', 'AMD Ryzen 3 and Ryzen 3 PRO 3000-series processors.', 203),
  ('amd', 'amd-ryzen-5-3000-series', 'AMD Ryzen 5 3000 Series', 'AMD Ryzen 5 and Ryzen 5 PRO 3000-series processors.', 204),
  ('amd', 'amd-ryzen-7-3000-series', 'AMD Ryzen 7 3000 Series', 'AMD Ryzen 7 and Ryzen 7 PRO 3000-series processors.', 205),
  ('amd', 'amd-ryzen-3-4000-series', 'AMD Ryzen 3 4000 Series', 'AMD Ryzen 3 and Ryzen 3 PRO 4000-series processors.', 206),
  ('amd', 'amd-ryzen-5-4000-series', 'AMD Ryzen 5 4000 Series', 'AMD Ryzen 5 and Ryzen 5 PRO 4000-series processors.', 207),
  ('amd', 'amd-ryzen-7-4000-series', 'AMD Ryzen 7 4000 Series', 'AMD Ryzen 7 and Ryzen 7 PRO 4000-series processors.', 208),
  ('amd', 'amd-ryzen-3-5000-series', 'AMD Ryzen 3 5000 Series', 'AMD Ryzen 3 and Ryzen 3 PRO 5000-series processors.', 209),
  ('amd', 'amd-ryzen-5-5000-series', 'AMD Ryzen 5 5000 Series', 'AMD Ryzen 5 and Ryzen 5 PRO 5000-series processors.', 210),
  ('amd', 'amd-ryzen-7-5000-series', 'AMD Ryzen 7 5000 Series', 'AMD Ryzen 7 and Ryzen 7 PRO 5000-series processors.', 211),
  ('amd', 'amd-ryzen-3-6000-series', 'AMD Ryzen 3 6000 Series', 'AMD Ryzen 3 and Ryzen 3 PRO 6000-series processors.', 212),
  ('amd', 'amd-ryzen-5-6000-series', 'AMD Ryzen 5 6000 Series', 'AMD Ryzen 5 and Ryzen 5 PRO 6000-series processors.', 213),
  ('amd', 'amd-ryzen-7-6000-series', 'AMD Ryzen 7 6000 Series', 'AMD Ryzen 7 and Ryzen 7 PRO 6000-series processors.', 214),
  ('amd', 'amd-ryzen-3-7000-series', 'AMD Ryzen 3 7000 Series', 'AMD Ryzen 3 and Ryzen 3 PRO 7000-series processors.', 215),
  ('amd', 'amd-ryzen-5-7000-series', 'AMD Ryzen 5 7000 Series', 'AMD Ryzen 5 and Ryzen 5 PRO 7000-series processors.', 216),
  ('amd', 'amd-ryzen-7-7000-series', 'AMD Ryzen 7 7000 Series', 'AMD Ryzen 7 and Ryzen 7 PRO 7000-series processors.', 217),
  ('amd', 'amd-ryzen-3-8000-series', 'AMD Ryzen 3 8000 Series', 'AMD Ryzen 3 and Ryzen 3 PRO 8000-series processors.', 218),
  ('amd', 'amd-ryzen-5-8000-series', 'AMD Ryzen 5 8000 Series', 'AMD Ryzen 5 and Ryzen 5 PRO 8000-series processors.', 219),
  ('amd', 'amd-ryzen-7-8000-series', 'AMD Ryzen 7 8000 Series', 'AMD Ryzen 7 and Ryzen 7 PRO 8000-series processors.', 220),
  ('apple', 'apple-m1-family', 'Apple M1 Family', 'Apple M1, M1 Pro, M1 Max, and M1 Ultra processors.', 301),
  ('apple', 'apple-m2-family', 'Apple M2 Family', 'Apple M2, M2 Pro, M2 Max, and M2 Ultra processors.', 302),
  ('apple', 'apple-m3-family', 'Apple M3 Family', 'Apple M3, M3 Pro, M3 Max, and M3 Ultra processors.', 303),
  ('apple', 'apple-m4-family', 'Apple M4 Family', 'Apple M4, M4 Pro, M4 Max, and M4 Ultra processors.', 304),
  ('apple', 'apple-m5-family', 'Apple M5 Family', 'Apple M5, M5 Pro, M5 Max, and M5 Ultra processors.', 305),
  ('qualcomm', 'qualcomm-snapdragon-7c', 'Qualcomm Snapdragon 7c', 'Qualcomm Snapdragon 7c family processors.', 400),
  ('qualcomm', 'qualcomm-snapdragon-8cx', 'Qualcomm Snapdragon 8cx', 'Qualcomm Snapdragon 8cx family processors.', 401),
  ('qualcomm', 'qualcomm-snapdragon-x', 'Qualcomm Snapdragon X', 'Qualcomm Snapdragon X Plus and X Elite processors.', 402),
  ('mediatek', 'mediatek-kompanio', 'MediaTek Kompanio', 'MediaTek Kompanio processors.', 500),
  ('mediatek', 'mediatek-mt81xx', 'MediaTek MT81xx', 'MediaTek MT81xx processors.', 501),
  ('rockchip', 'rockchip-rk32xx', 'Rockchip RK32xx', 'Rockchip RK32xx processors.', 600),
  ('rockchip', 'rockchip-rk33xx', 'Rockchip RK33xx', 'Rockchip RK33xx processors.', 601);

INSERT INTO processor_families (
  processor_brand_id,
  code,
  name,
  description,
  membership_version,
  sort_order,
  is_active
)
SELECT
  pb.processor_brand_id,
  seed.family_code,
  seed.family_name,
  seed.description,
  1,
  seed.sort_order,
  1
FROM tmp_stage7e_processor_family_seed seed
INNER JOIN processor_brands pb
  ON LOWER(TRIM(pb.code)) = LOWER(TRIM(seed.brand_code))
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = 1;

DROP TEMPORARY TABLE tmp_stage7e_processor_family_seed;

CREATE TEMPORARY TABLE tmp_stage7e_processor_family_classification (
  processor_model_id INT NOT NULL,
  family_code VARCHAR(100) NOT NULL,
  PRIMARY KEY (processor_model_id, family_code)
) ENGINE=Memory DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO tmp_stage7e_processor_family_classification (processor_model_id, family_code)
SELECT
  pm.processor_model_id,
  CASE
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?6[0-9]{3}' THEN 'intel-i3-6th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?6[0-9]{3}' THEN 'intel-i5-6th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?6[0-9]{3}' THEN 'intel-i7-6th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?7[0-9]{3}' THEN 'intel-i3-7th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?7[0-9]{3}' THEN 'intel-i5-7th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?7[0-9]{3}' THEN 'intel-i7-7th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?8[0-9]{3}' THEN 'intel-i3-8th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?8[0-9]{3}' THEN 'intel-i5-8th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?8[0-9]{3}' THEN 'intel-i7-8th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?9[0-9]{3}' THEN 'intel-i3-9th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?9[0-9]{3}' THEN 'intel-i5-9th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?9[0-9]{3}' THEN 'intel-i7-9th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?10[0-9]{3}' THEN 'intel-i3-10th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?10[0-9]{3}' THEN 'intel-i5-10th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?10[0-9]{3}' THEN 'intel-i7-10th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?11[0-9]{2,3}' THEN 'intel-i3-11th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?11[0-9]{2,3}' THEN 'intel-i5-11th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?11[0-9]{2,3}' THEN 'intel-i7-11th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?12[0-9]{2,3}' THEN 'intel-i3-12th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?12[0-9]{2,3}' THEN 'intel-i5-12th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?12[0-9]{2,3}' THEN 'intel-i7-12th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I3[- ]?13[0-9]{2,3}' THEN 'intel-i3-13th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I5[- ]?13[0-9]{2,3}' THEN 'intel-i5-13th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'I7[- ]?13[0-9]{2,3}' THEN 'intel-i7-13th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'CORE[ ]+M3[- ]?6' THEN 'intel-core-m3-6th-gen'
        WHEN UPPER(pm.model_code) REGEXP 'CELERON' THEN 'intel-celeron'
        WHEN UPPER(pm.model_code) REGEXP 'PENTIUM[ ]+SILVER' THEN 'intel-pentium-silver'
        WHEN UPPER(pm.model_code) REGEXP 'CORE[ ]+ULTRA[ ]+5[ ]+1[0-9]{2}' THEN 'intel-core-ultra-5-series-1'
        WHEN UPPER(pm.model_code) REGEXP 'CORE[ ]+ULTRA[ ]+7[ ]+1[0-9]{2}' THEN 'intel-core-ultra-7-series-1'
        WHEN UPPER(pm.model_code) REGEXP 'CORE[ ]+ULTRA[ ]+5[ ]+2[0-9]{2}' THEN 'intel-core-ultra-5-series-2'
        WHEN UPPER(pm.model_code) REGEXP 'CORE[ ]+ULTRA[ ]+7[ ]+2[0-9]{2}' THEN 'intel-core-ultra-7-series-2'
        ELSE NULL
  END AS family_code
FROM processor_models pm
INNER JOIN processor_brands pb
  ON pb.processor_brand_id = pm.processor_brand_id
WHERE LOWER(TRIM(pb.code)) = 'intel'
HAVING family_code IS NOT NULL;

INSERT IGNORE INTO tmp_stage7e_processor_family_classification (processor_model_id, family_code)
SELECT
  pm.processor_model_id,
  CASE
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+3([ ]+PRO)?[ ]+2[0-9]{3}' THEN 'amd-ryzen-3-2000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+5([ ]+PRO)?[ ]+2[0-9]{3}' THEN 'amd-ryzen-5-2000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+7([ ]+PRO)?[ ]+2[0-9]{3}' THEN 'amd-ryzen-7-2000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+3([ ]+PRO)?[ ]+3[0-9]{3}' THEN 'amd-ryzen-3-3000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+5([ ]+PRO)?[ ]+3[0-9]{3}' THEN 'amd-ryzen-5-3000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+7([ ]+PRO)?[ ]+3[0-9]{3}' THEN 'amd-ryzen-7-3000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+3([ ]+PRO)?[ ]+4[0-9]{3}' THEN 'amd-ryzen-3-4000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+5([ ]+PRO)?[ ]+4[0-9]{3}' THEN 'amd-ryzen-5-4000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+7([ ]+PRO)?[ ]+4[0-9]{3}' THEN 'amd-ryzen-7-4000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+3([ ]+PRO)?[ ]+5[0-9]{3}' THEN 'amd-ryzen-3-5000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+5([ ]+PRO)?[ ]+5[0-9]{3}' THEN 'amd-ryzen-5-5000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+7([ ]+PRO)?[ ]+5[0-9]{3}' THEN 'amd-ryzen-7-5000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+3([ ]+PRO)?[ ]+6[0-9]{3}' THEN 'amd-ryzen-3-6000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+5([ ]+PRO)?[ ]+6[0-9]{3}' THEN 'amd-ryzen-5-6000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+7([ ]+PRO)?[ ]+6[0-9]{3}' THEN 'amd-ryzen-7-6000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+3([ ]+PRO)?[ ]+7[0-9]{3}' THEN 'amd-ryzen-3-7000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+5([ ]+PRO)?[ ]+7[0-9]{3}' THEN 'amd-ryzen-5-7000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+7([ ]+PRO)?[ ]+7[0-9]{3}' THEN 'amd-ryzen-7-7000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+3([ ]+PRO)?[ ]+8[0-9]{3}' THEN 'amd-ryzen-3-8000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+5([ ]+PRO)?[ ]+8[0-9]{3}' THEN 'amd-ryzen-5-8000-series'
        WHEN UPPER(pm.model_code) REGEXP 'RYZEN[ ]+7([ ]+PRO)?[ ]+8[0-9]{3}' THEN 'amd-ryzen-7-8000-series'
        ELSE NULL
  END AS family_code
FROM processor_models pm
INNER JOIN processor_brands pb
  ON pb.processor_brand_id = pm.processor_brand_id
WHERE LOWER(TRIM(pb.code)) = 'amd'
HAVING family_code IS NOT NULL;

INSERT IGNORE INTO tmp_stage7e_processor_family_classification (processor_model_id, family_code)
SELECT
  pm.processor_model_id,
  CASE
        WHEN UPPER(pm.model_code) REGEXP '(^|[ ])(APPLE[ ]+)?M1([ ]|$)' THEN 'apple-m1-family'
        WHEN UPPER(pm.model_code) REGEXP '(^|[ ])(APPLE[ ]+)?M2([ ]|$)' THEN 'apple-m2-family'
        WHEN UPPER(pm.model_code) REGEXP '(^|[ ])(APPLE[ ]+)?M3([ ]|$)' THEN 'apple-m3-family'
        WHEN UPPER(pm.model_code) REGEXP '(^|[ ])(APPLE[ ]+)?M4([ ]|$)' THEN 'apple-m4-family'
        WHEN UPPER(pm.model_code) REGEXP '(^|[ ])(APPLE[ ]+)?M5([ ]|$)' THEN 'apple-m5-family'
        ELSE NULL
  END AS family_code
FROM processor_models pm
INNER JOIN processor_brands pb
  ON pb.processor_brand_id = pm.processor_brand_id
WHERE LOWER(TRIM(pb.code)) = 'apple'
HAVING family_code IS NOT NULL;

INSERT IGNORE INTO tmp_stage7e_processor_family_classification (processor_model_id, family_code)
SELECT pm.processor_model_id,
  CASE
    WHEN UPPER(pm.model_code) REGEXP 'SNAPDRAGON[ ]+X' THEN 'qualcomm-snapdragon-x'
    WHEN UPPER(pm.model_code) REGEXP 'SNAPDRAGON[ ]+8CX' THEN 'qualcomm-snapdragon-8cx'
    WHEN UPPER(pm.model_code) REGEXP 'SNAPDRAGON[ ]+7C' THEN 'qualcomm-snapdragon-7c'
    ELSE NULL
  END AS family_code
FROM processor_models pm
INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
WHERE LOWER(TRIM(pb.code)) = 'qualcomm'
HAVING family_code IS NOT NULL;

INSERT IGNORE INTO tmp_stage7e_processor_family_classification (processor_model_id, family_code)
SELECT pm.processor_model_id,
  CASE
    WHEN UPPER(pm.model_code) REGEXP 'KOMPANIO' THEN 'mediatek-kompanio'
    WHEN UPPER(pm.model_code) REGEXP 'MT81[0-9]{2}' THEN 'mediatek-mt81xx'
    ELSE NULL
  END AS family_code
FROM processor_models pm
INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
WHERE LOWER(TRIM(pb.code)) = 'mediatek'
HAVING family_code IS NOT NULL;

INSERT IGNORE INTO tmp_stage7e_processor_family_classification (processor_model_id, family_code)
SELECT pm.processor_model_id,
  CASE
    WHEN UPPER(pm.model_code) REGEXP 'RK32[0-9]{2}' THEN 'rockchip-rk32xx'
    WHEN UPPER(pm.model_code) REGEXP 'RK33[0-9]{2}' THEN 'rockchip-rk33xx'
    ELSE NULL
  END AS family_code
FROM processor_models pm
INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
WHERE LOWER(TRIM(pb.code)) = 'rockchip'
HAVING family_code IS NOT NULL;

INSERT INTO processor_family_members (
  processor_family_id,
  processor_model_id,
  assignment_source
)
SELECT
  pf.processor_family_id,
  classification.processor_model_id,
  'seed'
FROM tmp_stage7e_processor_family_classification classification
INNER JOIN processor_families pf
  ON pf.code COLLATE utf8mb4_unicode_ci =
     classification.family_code COLLATE utf8mb4_unicode_ci
ON DUPLICATE KEY UPDATE
  assignment_source = CASE
    WHEN assignment_source = 'manual' THEN assignment_source
    ELSE VALUES(assignment_source)
  END,
  updated_at = CURRENT_TIMESTAMP;

DROP TEMPORARY TABLE tmp_stage7e_processor_family_classification;

SELECT
  (SELECT COUNT(*) FROM processor_families) AS processor_family_count,
  (SELECT COUNT(*) FROM processor_family_members) AS categorized_processor_memberships,
  (
    SELECT COUNT(*)
    FROM processor_models pm
    LEFT JOIN processor_family_members pfm
      ON pfm.processor_model_id = pm.processor_model_id
    WHERE pm.is_active = 1
      AND pfm.processor_model_id IS NULL
  ) AS active_processors_needing_review;

SELECT 'Stage 7E Processor Family requirements migration complete' AS message;
