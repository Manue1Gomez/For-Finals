const express = require('express');
const voucherController = require('../controllers/voucherController');

const router = express.Router();

router.get('/', voucherController.list);
router.post('/', voucherController.create);
router.put('/:id', voucherController.update);
router.delete('/:id', voucherController.remove);

module.exports = router;
