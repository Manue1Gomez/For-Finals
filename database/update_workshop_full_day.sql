UPDATE booking b
JOIN booking_service bs ON bs.booking_id = b.booking_id
JOIN service s ON s.service_id = bs.service_id
   SET b.start_time = '03:00:00',
       b.end_time = '22:00:00'
 WHERE LOWER(s.service_name) LIKE '%modeling workshop%';
