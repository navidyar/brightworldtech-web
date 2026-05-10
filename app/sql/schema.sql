CREATE DATABASE IF NOT EXISTS bwtdallas
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE bwtdallas;

CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(45) NOT NULL,
  last_name VARCHAR(45) NOT NULL,
  phone VARCHAR(25) NULL,
  email VARCHAR(100) NOT NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(45) NULL,
  state VARCHAR(45) NULL,
  zip VARCHAR(15) NULL,
  start_date DATE NULL,
  employment_status TINYINT(1) NOT NULL DEFAULT 1,
  role VARCHAR(45) NOT NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY employees_email_unique (email),
  KEY employees_role_status_idx (role, employment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS locations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(45) NULL,
  state VARCHAR(45) NULL,
  postal_code VARCHAR(15) NULL,
  province VARCHAR(45) NULL,
  country VARCHAR(45) NOT NULL DEFAULT 'USA',
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY locations_name_idx (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lots (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  locations_id INT UNSIGNED NOT NULL,
  employees_id INT UNSIGNED NULL,
  lot_type VARCHAR(45) NULL,
  lot_name VARCHAR(80) NOT NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY lots_locations_idx (locations_id),
  KEY lots_employees_idx (employees_id),
  CONSTRAINT lots_locations_fk
    FOREIGN KEY (locations_id) REFERENCES locations (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lots_employees_fk
    FOREIGN KEY (employees_id) REFERENCES employees (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lots_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY projects_lots_idx (lots_id),
  CONSTRAINT projects_lots_fk
    FOREIGN KEY (lots_id) REFERENCES lots (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS units (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  projects_id INT UNSIGNED NOT NULL,
  unit_type VARCHAR(45) NULL,
  bios_serial VARCHAR(80) NULL,
  unit_serial VARCHAR(80) NULL,
  pram INT UNSIGNED NULL,
  pssd INT UNSIGNED NULL,
  ram INT UNSIGNED NULL,
  ssd INT UNSIGNED NULL,
  icloud_status VARCHAR(45) NULL,
  mdm_status VARCHAR(45) NULL,
  model_number VARCHAR(80) NULL,
  model_identifier VARCHAR(80) NULL,
  color VARCHAR(45) NULL,
  operating_system VARCHAR(80) NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY units_unit_serial_unique (unit_serial),
  KEY units_projects_idx (projects_id),
  KEY units_type_status_idx (unit_type, icloud_status, mdm_status),
  CONSTRAINT units_projects_fk
    FOREIGN KEY (projects_id) REFERENCES projects (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS units_has_techs (
  units_id INT UNSIGNED NOT NULL,
  units_projects_id INT UNSIGNED NOT NULL,
  techs_id INT UNSIGNED NOT NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (units_id, units_projects_id, techs_id),
  KEY units_has_techs_techs_idx (techs_id),
  CONSTRAINT units_has_techs_units_fk
    FOREIGN KEY (units_id) REFERENCES units (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT units_has_techs_projects_fk
    FOREIGN KEY (units_projects_id) REFERENCES projects (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT units_has_techs_employees_fk
    FOREIGN KEY (techs_id) REFERENCES employees (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  locations_id INT UNSIGNED NOT NULL,
  inventory_type VARCHAR(45) NULL,
  amount INT UNSIGNED NOT NULL DEFAULT 0,
  vendor VARCHAR(80) NULL,
  vendor_location VARCHAR(255) NULL,
  status VARCHAR(45) NOT NULL DEFAULT 'available',
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY inventory_locations_idx (locations_id),
  KEY inventory_type_status_idx (inventory_type, status),
  CONSTRAINT inventory_locations_fk
    FOREIGN KEY (locations_id) REFERENCES locations (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_zones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  locations_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY warehouse_zones_locations_idx (locations_id),
  CONSTRAINT warehouse_zones_locations_fk
    FOREIGN KEY (locations_id) REFERENCES locations (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_racks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_zones_id INT UNSIGNED NOT NULL,
  rack_code VARCHAR(45) NOT NULL,
  bin_code VARCHAR(45) NULL,
  capacity INT UNSIGNED NULL,
  status VARCHAR(45) NOT NULL DEFAULT 'active',
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY warehouse_racks_code_unique (warehouse_zones_id, rack_code, bin_code),
  CONSTRAINT warehouse_racks_zones_fk
    FOREIGN KEY (warehouse_zones_id) REFERENCES warehouse_zones (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS technician_unit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  units_id INT UNSIGNED NOT NULL,
  techs_id INT UNSIGNED NOT NULL,
  event_type VARCHAR(45) NOT NULL,
  status_from VARCHAR(45) NULL,
  status_to VARCHAR(45) NULL,
  notes TEXT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY technician_unit_events_units_idx (units_id),
  KEY technician_unit_events_techs_event_idx (techs_id, event_at),
  CONSTRAINT technician_unit_events_units_fk
    FOREIGN KEY (units_id) REFERENCES units (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT technician_unit_events_employees_fk
    FOREIGN KEY (techs_id) REFERENCES employees (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inventory_id INT UNSIGNED NOT NULL,
  from_rack_id INT UNSIGNED NULL,
  to_rack_id INT UNSIGNED NULL,
  employees_id INT UNSIGNED NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  movement_type VARCHAR(45) NOT NULL,
  notes TEXT NULL,
  moved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY inventory_movements_inventory_idx (inventory_id),
  KEY inventory_movements_moved_at_idx (moved_at),
  CONSTRAINT inventory_movements_inventory_fk
    FOREIGN KEY (inventory_id) REFERENCES inventory (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT inventory_movements_from_rack_fk
    FOREIGN KEY (from_rack_id) REFERENCES warehouse_racks (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT inventory_movements_to_rack_fk
    FOREIGN KEY (to_rack_id) REFERENCES warehouse_racks (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT inventory_movements_employees_fk
    FOREIGN KEY (employees_id) REFERENCES employees (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  contact_name VARCHAR(120) NULL,
  email VARCHAR(100) NULL,
  phone VARCHAR(25) NULL,
  status VARCHAR(45) NOT NULL DEFAULT 'active',
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY customers_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_opportunities (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customers_id INT UNSIGNED NOT NULL,
  employees_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  stage VARCHAR(45) NOT NULL DEFAULT 'new',
  expected_value DECIMAL(12,2) NULL,
  expected_close_date DATE NULL,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sales_opportunities_customers_idx (customers_id),
  KEY sales_opportunities_stage_idx (stage),
  CONSTRAINT sales_opportunities_customers_fk
    FOREIGN KEY (customers_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT sales_opportunities_employees_fk
    FOREIGN KEY (employees_id) REFERENCES employees (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customers_id INT UNSIGNED NOT NULL,
  sales_opportunities_id INT UNSIGNED NULL,
  status VARCHAR(45) NOT NULL DEFAULT 'draft',
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sales_orders_customers_idx (customers_id),
  KEY sales_orders_status_idx (status),
  CONSTRAINT sales_orders_customers_fk
    FOREIGN KEY (customers_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sales_orders_opportunities_fk
    FOREIGN KEY (sales_opportunities_id) REFERENCES sales_opportunities (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS config_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(45) NOT NULL,
  label VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY config_categories_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS config_values (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  config_category_id INT UNSIGNED NOT NULL,
  value VARCHAR(80) NOT NULL,
  label VARCHAR(80) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY config_values_category_value_unique (config_category_id, value),
  KEY config_values_active_sort_idx (is_active, sort_order),
  CONSTRAINT config_values_categories_fk
    FOREIGN KEY (config_category_id) REFERENCES config_categories (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
