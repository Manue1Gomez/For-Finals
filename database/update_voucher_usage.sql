ALTER TABLE voucher
  ADD COLUMN used_count INT NOT NULL DEFAULT 0 AFTER usage_limit;

UPDATE voucher v
LEFT JOIN (
  SELECT voucher_code, COUNT(*) AS used_count
    FROM booking
   WHERE voucher_code IS NOT NULL
   GROUP BY voucher_code
) b ON b.voucher_code = v.voucher_code
   SET v.used_count = COALESCE(b.used_count, 0);
