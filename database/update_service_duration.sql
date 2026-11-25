ALTER TABLE service
  ADD COLUMN duration_hours INT NULL DEFAULT 2;

UPDATE service
   SET duration_hours = NULL
 WHERE LOWER(service_name) LIKE '%modeling workshop%';

UPDATE service
   SET duration_hours = 2
 WHERE duration_hours IS NULL
   AND LOWER(service_name) NOT LIKE '%modeling workshop%';
