const express = require('express');
const workshopController = require('../controllers/workshopController');

const router = express.Router();

router.get('/', workshopController.list);
router.patch('/:bookingId/schedule', workshopController.reschedule);

module.exports = router;
