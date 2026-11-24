const express = require('express');
const netcorepayWebhookController = require('../controllers/netcorepayWebhookController');

const router = express.Router();

router.post(
  '/netcorepay',
  express.raw({ type: 'application/json', limit: '64kb' }),
  netcorepayWebhookController.handle
);

module.exports = router;
