const express = require('express');
const bookingController = require('../controllers/bookingController');

const router = express.Router();

router.get('/', bookingController.list);
router.post('/auto-complete', bookingController.autoComplete);
router.get('/:id', bookingController.details);
router.put('/:id', bookingController.update);
router.delete('/:id', bookingController.remove);

module.exports = router;
