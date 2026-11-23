-- Run this in phpMyAdmin so reschedule requests can be stored.
-- If the table already exists from an earlier version, run
-- update_reschedule_table.sql instead of this file.

CREATE TABLE IF NOT EXISTS reschedule_request (
  request_id        INT  NOT NULL AUTO_INCREMENT,
  booking_id        INT  NOT NULL,
  old_date          DATE NOT NULL,
  old_start_time    TIME NOT NULL,
  old_end_time      TIME NOT NULL,
  new_date          DATE NOT NULL,
  new_start_time    TIME NOT NULL,
  new_end_time      TIME NOT NULL,
  status            ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at       TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (request_id),
  KEY idx_reschedule_booking (booking_id),
  KEY idx_reschedule_status (status, created_at),
  CONSTRAINT fk_reschedule_booking FOREIGN KEY (booking_id)
    REFERENCES booking (booking_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
