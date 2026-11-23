-- Run this ONLY if reschedule_request was created from the old reschedule_table.sql.
-- It adds the old_date / old_start_time / old_end_time columns that the
-- customer reschedule form and the admin page need, then fills them for
-- any existing rows. (ADD COLUMN IF NOT EXISTS works on XAMPP's MariaDB.)

ALTER TABLE reschedule_request
  ADD COLUMN IF NOT EXISTS old_date       DATE NULL AFTER booking_id,
  ADD COLUMN IF NOT EXISTS old_start_time TIME NULL AFTER old_date,
  ADD COLUMN IF NOT EXISTS old_end_time   TIME NULL AFTER old_start_time;

UPDATE reschedule_request rr
  JOIN booking b ON b.booking_id = rr.booking_id
   SET rr.old_date       = b.event_date,
       rr.old_start_time = b.start_time,
       rr.old_end_time   = b.end_time
 WHERE rr.old_date IS NULL;

ALTER TABLE reschedule_request
  MODIFY old_date       DATE NOT NULL,
  MODIFY old_start_time TIME NOT NULL,
  MODIFY old_end_time   TIME NOT NULL;

ALTER TABLE reschedule_request
  ADD KEY IF NOT EXISTS idx_reschedule_status (status, created_at);
