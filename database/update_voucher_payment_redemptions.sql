-- Requires voucher.used_count from database/update_voucher_usage.sql.
ALTER TABLE booking
  ADD COLUMN voucher_consumed TINYINT(1) NOT NULL DEFAULT 0 AFTER voucher_code;

UPDATE booking b
LEFT JOIN (
  SELECT booking_id, COUNT(*) AS active_payment_count
    FROM payment
   WHERE status IN ('Pending', 'Verified')
   GROUP BY booking_id
) p ON p.booking_id = b.booking_id
   SET b.voucher_consumed = CASE
     WHEN b.voucher_code IS NOT NULL
      AND b.status <> 'Rejected'
      AND COALESCE(p.active_payment_count, 0) > 0
     THEN 1
     ELSE 0
   END;

UPDATE voucher v
LEFT JOIN (
  SELECT voucher_code, COUNT(*) AS used_count
    FROM booking
   WHERE voucher_consumed = 1
   GROUP BY voucher_code
) b ON b.voucher_code = v.voucher_code
   SET v.used_count = COALESCE(b.used_count, 0);
