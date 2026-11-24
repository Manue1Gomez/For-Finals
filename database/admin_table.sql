
CREATE TABLE IF NOT EXISTS admin (
  admin_id    INT          NOT NULL AUTO_INCREMENT,
  f_name      VARCHAR(50)  NOT NULL,
  l_name      VARCHAR(50)  NOT NULL,
  email       VARCHAR(100) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_id),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sample administrator account (password: Admin@12345)
INSERT IGNORE INTO admin (f_name, l_name, email, password)
VALUES ('BRB', 'Administrator', 'admin@brbstudios.com', '$2a$10$AUx/P3iNjqr2lyDOShyhke9XKNkpSJaSPVl4xaiiqal28Krsw4Gwq');
