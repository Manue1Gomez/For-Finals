const test = require('node:test');
const assert = require('node:assert/strict');

const { BOOKING_STATUS, RESCHEDULE_STATUS } = require('../config/bookingStatus');
const {
  buildBookingDecisionEmail,
  buildRescheduleDecisionEmail,
} = require('../services/customerNotificationEmailService');

const booking = {
  customerName: 'Alex&Jamie Doe',
  customerEmail: 'alex@example.com',
  reference: 'BRB-123',
  eventDate: '2026-12-10',
  startTime: '09:00',
  endTime: '10:00',
};

test('accepted booking email includes downpayment instructions and escapes customer content', () => {
  const message = buildBookingDecisionEmail({
    booking,
    status: BOOKING_STATUS.TO_PAY,
    downpaymentCents: 50000,
  });

  assert.match(message.subject, /accepted/);
  assert.match(message.text, /downpayment of ₱500\.00/);
  assert.match(message.text, /My Bookings/);
  assert.match(message.html, /Alex&amp;Jamie/);
});

test('rejected booking email does not request payment', () => {
  const message = buildBookingDecisionEmail({
    booking,
    status: BOOKING_STATUS.REJECTED,
    downpaymentCents: null,
  });

  assert.match(message.subject, /update/);
  assert.match(message.text, /not approved/);
  assert.doesNotMatch(message.text, /downpayment/);
});

test('conflicting booking rejection email asks the customer to choose another schedule', () => {
  const message = buildBookingDecisionEmail({
    booking,
    status: BOOKING_STATUS.REJECTED,
    reason: 'schedule_conflict',
  });

  assert.match(message.text, /overlapping time/);
  assert.match(message.text, /different time or date/);
  assert.match(message.html, /different time or date/);
});

test('reschedule decision emails explain approval and rejection outcomes', () => {
  const approved = buildRescheduleDecisionEmail({
    booking: { ...booking, eventDate: '2026-12-12', startTime: '11:00', endTime: '12:00' },
    status: RESCHEDULE_STATUS.APPROVED,
    requestedDate: '2026-12-12',
    requestedStartTime: '11:00',
    requestedEndTime: '12:00',
  });
  const rejected = buildRescheduleDecisionEmail({
    booking,
    status: RESCHEDULE_STATUS.REJECTED,
    requestedDate: '2026-12-12',
    requestedStartTime: '11:00',
    requestedEndTime: '12:00',
  });

  assert.match(approved.text, /request was approved/);
  assert.match(approved.text, /New schedule:/);
  assert.match(rejected.text, /request could not be approved/);
  assert.match(rejected.text, /Current schedule:/);
  assert.match(rejected.text, /Requested schedule:/);
});
