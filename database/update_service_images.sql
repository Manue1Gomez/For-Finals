-- Run this in phpMyAdmin after placing the images in uploads/services/
-- Images should be named exactly as referenced below.

UPDATE service SET image_path = '/uploads/services/hair-and-makeup.jpg'
  WHERE service_name = 'Hair and Makeup';

UPDATE service SET image_path = '/uploads/services/photography.jpg'
  WHERE service_name = 'Photography';

UPDATE service SET image_path = '/uploads/services/modeling-workshop.jpg'
  WHERE service_name = 'Modeling Workshop';

UPDATE service SET image_path = '/uploads/services/event-planning.jpg'
  WHERE service_name = 'Event Planning';

UPDATE service SET image_path = '/uploads/services/event-coordination.jpg'
  WHERE service_name = 'Event Coordination';

UPDATE service SET image_path = '/uploads/services/pageant-training-and-styling.jpg'
  WHERE service_name = 'Pageant Training and Styling';
