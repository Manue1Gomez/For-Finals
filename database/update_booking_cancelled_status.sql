ALTER TABLE booking
  MODIFY status ENUM('Pending','To Pay','Confirmed','Completed','Rejected','Cancelled')
  NOT NULL DEFAULT 'Pending';
