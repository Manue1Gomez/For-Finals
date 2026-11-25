const express = require('express');
const clientController = require('../controllers/clientController');

const router = express.Router();

router.get('/by-email', clientController.findByEmail);
router.get('/', clientController.list);
router.get('/:id', clientController.details);

module.exports = router;
