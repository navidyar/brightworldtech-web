-- Step 7d: Login Activity Audit
-- Records each successful sign-in after this migration is applied.

CREATE TABLE IF NOT EXISTS user_login_activity (
  user_login_activity_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  primary_role_code VARCHAR(50) NOT NULL,
  logged_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_login_activity_id),
  KEY idx_user_login_activity_day (logged_in_at, user_id),
  KEY idx_user_login_activity_user (user_id, logged_in_at),
  CONSTRAINT fk_user_login_activity_user
    FOREIGN KEY (user_id)
    REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Step 7d login activity audit migration complete' AS message;
