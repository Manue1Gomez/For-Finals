SET @customer      := (SELECT customer_id FROM customer ORDER BY customer_id LIMIT 1);
SET @hair          := (SELECT service_id FROM service WHERE service_name = 'Hair and Makeup');
SET @modeling      := (SELECT service_id FROM service WHERE service_name = 'Modeling Workshop');
SET @photo         := (SELECT service_id FROM service WHERE service_name = 'Photography');
SET @planning      := (SELECT service_id FROM service WHERE service_name = 'Event Planning');
SET @coordination  := (SELECT service_id FROM service WHERE service_name = 'Event Coordination');
SET @pageant       := (SELECT service_id FROM service WHERE service_name = 'Pageant Training and Styling');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-03'), '09:00:00', '12:00:00', 3000, 0, 3000, 3000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @hair, 3000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 1500, 'GCash', '5021 338 770217', 'Verified', 'Customer', CURDATE() - INTERVAL 5 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 5 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 1500, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-03'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-14'), '08:00:00', '17:00:00', 8000, 0, 8000, 8000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @pageant, 8000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 4000, 'GCash', '5021 338 770234', 'Verified', 'Customer', CURDATE() - INTERVAL 5 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 5 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 4000, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-14'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-06'), '10:00:00', '14:00:00', 6000, 0, 6000, 6000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @photo, 6000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 3000, 'GCash', '5021 338 770251', 'Verified', 'Customer', CURDATE() - INTERVAL 4 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 4 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 3000, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-06'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-12'), '13:00:00', '16:00:00', 2500, 0, 2500, 2500, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @modeling, 2500);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 1250, 'GCash', '5021 338 770268', 'Verified', 'Customer', CURDATE() - INTERVAL 4 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 4 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 1250, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-12'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-20'), '09:00:00', '15:00:00', 6000, 600, 5400, 5400, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @hair, 3500), (@booking, @photo, 2500);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 2700, 'GCash', '5021 338 770285', 'Verified', 'Customer', CURDATE() - INTERVAL 4 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 4 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 2700, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-20'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 3 MONTH, '%Y-%m-08'), '08:00:00', '18:00:00', 12000, 0, 12000, 12000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @planning, 12000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 6000, 'GCash', '5021 338 770302', 'Verified', 'Customer', CURDATE() - INTERVAL 3 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 3 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 6000, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 3 MONTH, '%Y-%m-08'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 3 MONTH, '%Y-%m-21'), '09:00:00', '11:00:00', 3000, 0, 3000, 1500, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @hair, 3000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 1500, 'GCash', '5021 338 770319', 'Verified', 'Customer', CURDATE() - INTERVAL 3 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 3 MONTH - INTERVAL 20 DAY);

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-05'), '13:00:00', '16:00:00', 2500, 0, 2500, 2500, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @modeling, 2500);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 1250, 'GCash', '5021 338 770336', 'Verified', 'Customer', CURDATE() - INTERVAL 2 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 2 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 1250, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-05'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-15'), '08:00:00', '18:00:00', 9000, 0, 9000, 9000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @coordination, 9000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 4500, 'GCash', '5021 338 770353', 'Verified', 'Customer', CURDATE() - INTERVAL 2 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 2 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 4500, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-15'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-26'), '10:00:00', '13:00:00', 4000, 0, 4000, 2000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @photo, 4000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 2000, 'GCash', '5021 338 770370', 'Verified', 'Customer', CURDATE() - INTERVAL 2 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 2 MONTH - INTERVAL 20 DAY);

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-04'), '08:00:00', '17:00:00', 8000, 0, 8000, 8000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @pageant, 8000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 4000, 'GCash', '5021 338 770387', 'Verified', 'Customer', CURDATE() - INTERVAL 1 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 1 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 4000, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-04'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-11'), '09:00:00', '12:00:00', 3000, 0, 3000, 3000, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @hair, 3000);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 1500, 'GCash', '5021 338 770404', 'Verified', 'Customer', CURDATE() - INTERVAL 1 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 1 MONTH - INTERVAL 20 DAY);
INSERT INTO payment (booking_id, payment_type, amount, method, status, recorded_by, reviewed_at, note) VALUES
  (@booking, 'Balance', 1500, 'Cash', 'Verified', 'Admin', DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-11'), 'Paid in cash on the event day');

INSERT INTO booking (customer_id, event_date, start_time, end_time, subtotal, discount_amount, total_amount, amount_paid, status)
VALUES (@customer, DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-23'), '13:00:00', '16:00:00', 2500, 0, 2500, 1250, 'Completed');
SET @booking := LAST_INSERT_ID();
INSERT INTO booking_service (booking_id, service_id, price) VALUES (@booking, @modeling, 2500);
INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, recorded_by, reviewed_at, receipt_sent_at) VALUES
  (@booking, 'Downpayment', 1250, 'GCash', '5021 338 770421', 'Verified', 'Customer', CURDATE() - INTERVAL 1 MONTH - INTERVAL 20 DAY, CURDATE() - INTERVAL 1 MONTH - INTERVAL 20 DAY);
