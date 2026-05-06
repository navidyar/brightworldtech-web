DELETE FROM items;

ALTER TABLE items AUTO_INCREMENT = 1;

INSERT INTO items (name, category, quantity, price)
VALUES
  ('Dell Latitude 5420', 'Laptop', 12, 245.00),
  ('HP EliteDesk 800 G4', 'Desktop', 8, 180.00),
  ('Samsung 970 EVO 1TB', 'Storage', 25, 79.99),
  ('Kingston 16GB DDR4', 'Memory', 40, 32.50),
  ('Dell 24 Monitor', 'Monitor', 10, 95.00),
  ('Lenovo ThinkPad T14', 'Laptop', 6, 325.00),
  ('Crucial MX500 500GB', 'Storage', 14, 54.99),
  ('HP ProDesk 600 G5', 'Desktop', 4, 210.00),
  ('ASUS 27 Monitor', 'Monitor', 7, 155.00),
  ('Corsair 32GB DDR4', 'Memory', 9, 64.99);