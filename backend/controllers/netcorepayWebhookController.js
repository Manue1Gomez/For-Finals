const netcorepayService = require('../services/netcorepayService');
const paymentService = require('../services/paymentService');

async function handle(req, res, next) {
  const secret = netcorepayService.getWebhookSecret();
  if (!secret) {
    console.error('NetCorePay webhook received but NETCOREPAY_WEBHOOK_SECRET is not configured.');
    return res.status(503).json({ message: 'Webhook is not configured.' });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ message: 'Invalid webhook request body.' });
  }

  if (!netcorepayService.verifyWebhookSignature(
    req.body,
    req.get('x-nexuspay-signature'),
    secret
  )) {
    return res.status(401).json({ message: 'Invalid webhook signature.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Invalid webhook JSON.' });
  }

  try {
    const result = await paymentService.handleNetcorepayWebhook(event);
    if (result.status === 'terminal') {
      console.error(`NetCorePay event conflicts with a local payment already ${result.paymentStatus}.`);
    }
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
}

module.exports = { handle };
