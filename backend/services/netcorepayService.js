const crypto = require('crypto');

const API_BASE_URL = 'https://netcorepay.com';
const REQUEST_TIMEOUT_MS = 15_000;
const CHECKOUT_ID_PATTERN = /^pay_[A-Za-z0-9_-]{1,45}$/;
const PAYMENT_STATUSES = new Set(['pending', 'processing', 'succeeded', 'failed', 'expired', 'refunded']);

function isConfigured() {
  return Boolean(process.env.NETCOREPAY_SECRET_KEY);
}

function getWebhookSecret() {
  return process.env.NETCOREPAY_WEBHOOK_SECRET || null;
}

function validatePaymentResponse(payment, expectedAmount) {
  const amount = Number(payment?.amount);
  const checkoutUrl = typeof payment?.checkout_url === 'string'
    ? new URL(payment.checkout_url)
    : null;

  if (
    !CHECKOUT_ID_PATTERN.test(payment?.id || '') ||
    !Number.isFinite(amount) ||
    Math.round(amount * 100) !== expectedAmount ||
    payment.currency !== 'PHP' ||
    payment.method !== 'gcash_qr' ||
    !PAYMENT_STATUSES.has(payment.status) ||
    !checkoutUrl ||
    checkoutUrl.protocol !== 'https:' ||
    checkoutUrl.hostname !== 'netcorepay.com' ||
    checkoutUrl.username ||
    checkoutUrl.password
  ) {
    throw new Error('NetCorePay returned an invalid payment response.');
  }

  return payment;
}

async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
  const secretKey = process.env.NETCOREPAY_SECRET_KEY;
  if (!secretKey) throw new Error('NETCOREPAY_SECRET_KEY is not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    let data;
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        const error = new Error(`NetCorePay request failed with HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
      }
      throw new Error('NetCorePay returned an unreadable response.');
    }

    if (!response.ok) {
      const error = new Error(`NetCorePay request failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function createGCashPayment({ amountCents, description, returnUrl, metadata, idempotencyKey }) {
  const payment = await request('/v1/payments', {
    method: 'POST',
    idempotencyKey,
    body: {
      amount: amountCents / 100,
      currency: 'PHP',
      method: 'gcash_qr',
      description,
      return_url: returnUrl,
      metadata,
    },
  });

  return validatePaymentResponse(payment, amountCents);
}

async function getPayment(paymentId, amountCents) {
  if (!CHECKOUT_ID_PATTERN.test(paymentId || '')) {
    throw new Error('Invalid NetCorePay payment ID.');
  }

  const payment = await request(`/v1/payments/${encodeURIComponent(paymentId)}`);
  return validatePaymentResponse(payment, amountCents);
}

function verifyWebhookSignature(rawBody, header, secret, now = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || !secret) return false;

  const match = /^t=(\d+),v1=([a-f0-9]{64})$/i.exec(header);
  if (!match) return false;

  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(match[2], 'hex');

  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

module.exports = {
  isConfigured,
  getWebhookSecret,
  createGCashPayment,
  getPayment,
  verifyWebhookSignature,
};
