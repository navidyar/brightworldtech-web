CREATE DATABASE IF NOT EXISTS bwtdallas_scantool
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'bwtdallas'@'%' IDENTIFIED BY 'Office1234##';

ALTER USER 'bwtdallas'@'%' IDENTIFIED BY 'Office1234##';

GRANT ALL PRIVILEGES ON bwtdallas_db.* TO 'bwtdallas'@'%';

FLUSH PRIVILEGES;