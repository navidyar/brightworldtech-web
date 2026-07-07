-- Step 7f: Catalog Exception Workflow
-- Extends the shared Unit Requests framework. Techs request missing Model or
-- Processor compatibility values; only Management/Admin approval changes catalogs.

CREATE TABLE IF NOT EXISTS unit_model_catalog_requests (
  unit_model_catalog_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_request_id BIGINT UNSIGNED NOT NULL,
  manufacturer_id INT NOT NULL,
  unit_category_config_value_id INT NOT NULL,
  requested_model_name VARCHAR(150) NOT NULL,
  approved_model_name VARCHAR(150) NULL,
  approved_unit_model_id INT NULL,
  PRIMARY KEY (unit_model_catalog_request_id),
  UNIQUE KEY uq_unit_model_catalog_requests_request (unit_request_id),
  KEY idx_unit_model_catalog_requests_context (manufacturer_id, unit_category_config_value_id),
  KEY idx_unit_model_catalog_requests_approved_model (approved_unit_model_id),
  CONSTRAINT fk_unit_model_catalog_requests_request
    FOREIGN KEY (unit_request_id)
    REFERENCES unit_requests (unit_request_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_unit_model_catalog_requests_manufacturer
    FOREIGN KEY (manufacturer_id)
    REFERENCES manufacturers (manufacturer_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_model_catalog_requests_category
    FOREIGN KEY (unit_category_config_value_id)
    REFERENCES config_values (config_value_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_model_catalog_requests_approved_model
    FOREIGN KEY (approved_unit_model_id)
    REFERENCES unit_models (unit_model_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS unit_processor_catalog_requests (
  unit_processor_catalog_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_request_id BIGINT UNSIGNED NOT NULL,
  unit_model_id INT NOT NULL,
  requested_processor_type VARCHAR(100) NOT NULL,
  requested_processor_name VARCHAR(150) NOT NULL,
  approved_processor_brand_id INT NULL,
  approved_processor_model_id INT NULL,
  PRIMARY KEY (unit_processor_catalog_request_id),
  UNIQUE KEY uq_unit_processor_catalog_requests_request (unit_request_id),
  KEY idx_unit_processor_catalog_requests_model (unit_model_id),
  KEY idx_unit_processor_catalog_requests_approved_processor (approved_processor_model_id),
  CONSTRAINT fk_unit_processor_catalog_requests_request
    FOREIGN KEY (unit_request_id)
    REFERENCES unit_requests (unit_request_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_unit_processor_catalog_requests_unit_model
    FOREIGN KEY (unit_model_id)
    REFERENCES unit_models (unit_model_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_processor_catalog_requests_approved_brand
    FOREIGN KEY (approved_processor_brand_id)
    REFERENCES processor_brands (processor_brand_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_unit_processor_catalog_requests_approved_processor
    FOREIGN KEY (approved_processor_model_id)
    REFERENCES processor_models (processor_model_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Step 7f catalog exception workflow migration complete' AS message;
