CREATE TABLE IF NOT EXISTS booking_date_lock (
  event_date DATE NOT NULL,
  PRIMARY KEY (event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
