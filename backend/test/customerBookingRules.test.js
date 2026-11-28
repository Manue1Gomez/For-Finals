const test = require('node:test');
const assert = require('node:assert/strict');

const { BOOKING_STATUS } = require('../config/bookingStatus');
const { CUSTOMER_BOOKING_STATUS } = require('../services/paymentRules');
const {
  canCustomerCancel,
  canCustomerReschedule,
  isCustomerBookingDateAllowed,
  isWithinCustomerRescheduleWindow,
} = require('../services/customerBookingRules');

test('customers can cancel only Pending and To Pay bookings', () => {
  assert.equal(canCustomerCancel(BOOKING_STATUS.PENDING), true);
  assert.equal(canCustomerCancel(BOOKING_STATUS.TO_PAY), true);
  assert.equal(canCustomerCancel(BOOKING_STATUS.CONFIRMED), false);
  assert.equal(canCustomerCancel(BOOKING_STATUS.CANCELLED), false);
});

test('customer rescheduling requires For Verification or Confirmed and two days notice', () => {
  assert.equal(canCustomerReschedule(CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION, '2026-11-30', '2026-11-28'), true);
  assert.equal(canCustomerReschedule(BOOKING_STATUS.CONFIRMED, '2026-11-29', '2026-11-28'), false);
  assert.equal(canCustomerReschedule(BOOKING_STATUS.TO_PAY, '2026-11-30', '2026-11-28'), false);
});

test('rescheduling is closed for invalid dates and events less than two calendar days away', () => {
  assert.equal(isWithinCustomerRescheduleWindow('2026-11-30', '2026-11-28'), true);
  assert.equal(isWithinCustomerRescheduleWindow('2026-11-29', '2026-11-28'), false);
  assert.equal(isWithinCustomerRescheduleWindow('2026-02-30', '2026-02-27'), false);
});

test('customer bookings are only allowed starting two calendar days ahead', () => {
  assert.equal(isCustomerBookingDateAllowed('2026-11-28', '2026-11-28'), false);
  assert.equal(isCustomerBookingDateAllowed('2026-11-29', '2026-11-28'), false);
  assert.equal(isCustomerBookingDateAllowed('2026-11-30', '2026-11-28'), true);
  assert.equal(isCustomerBookingDateAllowed('2026-02-30', '2026-02-27'), false);
});
