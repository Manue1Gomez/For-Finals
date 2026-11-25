const express = require('express');
const walkInController = require('../controllers/walkInController');

const router = express.Router();

router.post('/', walkInController.create);

module.exports = router;
