const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const netcorepayService = require('../backend/services/netcorepayService');

test('verifies signed webhook bodies and rejects stale or altered deliveries', () => {
  const secret = 'whsec_test_secret';
  const now = Date.now();
  const timestamp = Math.floor(now / 1000);
  const body = Buffer.from('{"type":"payment.succeeded"}');
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');
  const header = `t=${timestamp},v1=${digest}`;

  assert.equal(netcorepayService.verifyWebhookSignature(body, header, secret, now), true);
  assert.equal(netcorepayService.verifyWebhookSignature(Buffer.from('{}'), header, secret, now), false);
  assert.equal(netcorepayService.verifyWebhookSignature(body, header, secret, now - 301_000), false);
  assert.equal(netcorepayService.verifyWebhookSignature(body, 'invalid', secret, now), false);
});

test('creates a GCash payment with idempotency and validates the checkout response', async (t) => {
  const originalKey = process.env.NETCOREPAY_SECRET_KEY;
  process.env.NETCOREPAY_SECRET_KEY = 'sk_test_unit';
  t.after(() => {
    if (originalKey === undefined) delete process.env.NETCOREPAY_SECRET_KEY;
    else process.env.NETCOREPAY_SECRET_KEY = originalKey;
  });

  let requestUrl;
  let requestOptions;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({
        id: 'pay_0123456789abcdef',
        status: 'pending',
        amount: 1250,
        currency: 'PHP',
        method: 'gcash_qr',
        checkout_url: 'https://netcorepay.com/checkout/pay_0123456789abcdef',
      }),
    };
  });

  const payment = await netcorepayService.createGCashPayment({
    amountCents: 125000,
    description: 'Booking downpayment',
    returnUrl: 'https://studio.example/customer/html/my-bookings.html',
    metadata: { booking_id: '17' },
    idempotencyKey: 'checkout-key',
  });

  assert.equal(requestUrl, 'https://netcorepay.com/v1/payments');
  assert.equal(requestOptions.headers.Authorization, 'Bearer sk_test_unit');
  assert.equal(requestOptions.headers['Idempotency-Key'], 'checkout-key');
  assert.equal(JSON.parse(requestOptions.body).method, 'gcash_qr');
  assert.equal(payment.id, 'pay_0123456789abcdef');
});

test('rejects a checkout URL outside the NetCorePay host', async (t) => {
  const originalKey = process.env.NETCOREPAY_SECRET_KEY;
  process.env.NETCOREPAY_SECRET_KEY = 'sk_test_unit';
  t.after(() => {
    if (originalKey === undefined) delete process.env.NETCOREPAY_SECRET_KEY;
    else process.env.NETCOREPAY_SECRET_KEY = originalKey;
  });

  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      id: 'pay_0123456789abcdef',
      status: 'pending',
      amount: 1250,
      currency: 'PHP',
      method: 'gcash_qr',
      checkout_url: 'https://attacker.example/checkout',
    }),
  }));

  await assert.rejects(
    netcorepayService.createGCashPayment({
      amountCents: 125000,
      description: 'Booking downpayment',
      returnUrl: 'https://studio.example/customer/html/my-bookings.html',
      metadata: {},
      idempotencyKey: 'checkout-key',
    }),
    /invalid payment response/i
  );
});
