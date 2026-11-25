-- ============================================================
-- Migration: Clear hashed contact numbers
-- ============================================================
-- Bcrypt hashes always start with '$2' and are 60+ characters.
-- Any contact_num matching that pattern was stored incorrectly
-- by an older version of the code. This migration sets those
-- rows to NULL so the admin/customer knows to re-enter the
-- correct number. Correctly-stored numbers (e.g. 09xxxxxxxxx)
-- are left untouched.
--
-- Run this ONCE against brbstudiodb, then restart the server.
-- ============================================================

-- Step 1: Allow NULL so we can clear the bad values.
ALTER TABLE customer
  MODIFY COLUMN contact_num VARCHAR(15) NULL;

-- Step 2: Clear only the rows where contact_num is a bcrypt hash.
UPDATE customer
   SET contact_num = NULL
 WHERE contact_num LIKE '$2%'
   AND CHAR_LENGTH(contact_num) >= 60;

-- ============================================================
-- After running this script:
--   • Customers whose contact number was hashed will show
--     "—" or blank in the admin client list.
--   • Customers can update their number via their Settings
--     page, or the admin can update it manually.
-- ============================================================
