CREATE TABLE IF NOT EXISTS blocked_time (
  blocked_time_id INT       NOT NULL AUTO_INCREMENT,
  event_date      DATE      NOT NULL,
  start_time      TIME      NOT NULL,
  end_time        TIME      NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocked_time_id),
  UNIQUE KEY uq_blocked_time_start (event_date, start_time),
  KEY idx_blocked_time_date (event_date),
  CONSTRAINT chk_blocked_time_range CHECK (end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
