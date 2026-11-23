-- Run this in phpMyAdmin if you want reschedule requests to be stored.
-- If you already created this table, skip it.

CREATE TABLE IF NOT EXISTS reschedule_request (
  request_id        INT  NOT NULL AUTO_INCREMENT,
  booking_id        INT  NOT NULL,
  new_date          DATE NOT NULL,
  new_start_time    TIME NOT NULL,
  new_end_time      TIME NOT NULL,
  status            ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at       TIMESTAMP NULL,
  PRIMARY KEY (request_id),
  KEY idx_reschedule_booking (booking_id),
  CONSTRAINT fk_reschedule_booking FOREIGN KEY (booking_id)
    REFERENCES booking (booking_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
