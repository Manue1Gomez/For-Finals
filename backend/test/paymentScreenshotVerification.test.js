const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const paymentModel = require('../models/paymentModel');
const bookingManagementModel = require('../models/bookingManagementModel');

const servicePath = require.resolve('../services/paymentService');
const originalWithTransaction = db.withTransaction;
const originalPaymentMethods = {
  findGatewayByReference: paymentModel.findGatewayByReference,
  findForUpdate: paymentModel.findForUpdate,
  findBookingId: paymentModel.findBookingId,
  markVerified: paymentModel.markVerified,
};
const originalBookingMethods = {
  lockById: bookingManagementModel.lockById,
  addToPaid: bookingManagementModel.addToPaid,
  setStatus: bookingManagementModel.setStatus,
};

db.withTransaction = (work) => work({});
delete require.cache[servicePath];
const paymentService = require(servicePath);

test('NetCorePay success waits for screenshot and admin verification', async (t) => {
  let payment = {
    id: 4,
    bookingId: 9,
    referenceNumber: 'pay_test_123',
    method: 'GCash',
    amount: 500,
    status: 'Pending',
    proofUrl: null,
  };
  const booking = {
    id: 9,
    status: 'To Pay',
    totalAmount: 1000,
    amountPaid: 0,
  };
  let creditedAmount = 0;
  let verified = 0;

  paymentModel.findGatewayByReference = async () => ({ id: payment.id, bookingId: booking.id });
  paymentModel.findForUpdate = async () => payment;
  paymentModel.findBookingId = async () => booking.id;
  paymentModel.markVerified = async () => { verified += 1; };
  bookingManagementModel.lockById = async () => booking;
  bookingManagementModel.addToPaid = async (_connection, _bookingId, amount) => { creditedAmount += amount; };
  bookingManagementModel.setStatus = async () => {};

  t.after(() => {
    db.withTransaction = originalWithTransaction;
    Object.assign(paymentModel, originalPaymentMethods);
    Object.assign(bookingManagementModel, originalBookingMethods);
    delete require.cache[servicePath];
  });

  const event = {
    type: 'payment.succeeded',
    data: {
      object: {
        id: payment.referenceNumber,
        amount: 500,
        currency: 'PHP',
        method: 'gcash_qr',
        status: 'succeeded',
        metadata: { payment_record_id: String(payment.id), booking_id: String(booking.id) },
      },
    },
  };

  assert.deepEqual(await paymentService.handleNetcorepayWebhook(event), { status: 'awaiting_proof' });
  assert.equal(creditedAmount, 0);
  assert.equal(payment.status, 'Pending');

  payment = { ...payment, proofUrl: '/uploads/payment-proofs/proof.png' };
  assert.deepEqual(await paymentService.handleNetcorepayWebhook(event), { status: 'awaiting_review' });
  assert.equal(creditedAmount, 0);
  assert.equal(verified, 0);

  payment = { ...payment, proofUrl: null };
  await assert.rejects(
    paymentService.verifyPayment(payment.id),
    (error) => error.status === 409 && /screenshot/i.test(error.message)
  );
  assert.equal(creditedAmount, 0);
  assert.equal(verified, 0);
});
