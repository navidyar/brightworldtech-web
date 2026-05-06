CREATE TABLE IF NOT EXISTS items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- INSERT INTO items (name, category, quantity, price)
-- VALUES
--   ('Dell Latitude 5420', 'Laptop', 12, 245.00),
--   ('HP EliteDesk 800 G4', 'Desktop', 8, 180.00),
--   ('Samsung 970 EVO 1TB', 'Storage', 25, 79.99),
--   ('Kingston 16GB DDR4', 'Memory', 40, 32.50),
--   ('Dell 24 Monitor', 'Monitor', 10, 95.00);