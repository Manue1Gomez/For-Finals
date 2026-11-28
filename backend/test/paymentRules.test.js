const test = require('node:test');
const assert = require('node:assert/strict');

const { BOOKING_STATUS } = require('../config/bookingStatus');
const {
  CUSTOMER_BOOKING_STATUS,
  customerFacingBookingStatus,
} = require('../services/paymentRules');

test('a submitted payment has its own status until it is verified', () => {
  assert.equal(
    customerFacingBookingStatus(BOOKING_STATUS.TO_PAY, true),
    CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION
  );
  assert.equal(
    customerFacingBookingStatus(BOOKING_STATUS.TO_PAY, false),
    BOOKING_STATUS.TO_PAY
  );
  assert.equal(
    customerFacingBookingStatus(BOOKING_STATUS.CONFIRMED, true),
    BOOKING_STATUS.CONFIRMED
  );
  assert.equal(
    customerFacingBookingStatus(BOOKING_STATUS.PENDING, false),
    BOOKING_STATUS.PENDING
  );
});
