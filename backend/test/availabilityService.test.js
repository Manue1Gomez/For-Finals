const test = require('node:test');
const assert = require('node:assert/strict');
const availabilityService = require('../services/availabilityService');
const bookingManagementModel = require('../models/bookingManagementModel');
const blockedDateModel = require('../models/blockedDateModel');
const blockedTimeModel = require('../models/blockedTimeModel');
const customerBookingModel = require('../models/customerBookingModel');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const { SCHEDULE_CONFLICT_STATUSES } = require('../config/bookingRules');
const { todayIso } = require('../services/timeHelper');

const service = { id: 1, name: 'Hair and Makeup', durationHours: 1 };

function futureDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function stub(t, target, key, implementation) {
  const original = target[key];
  target[key] = implementation;
  t.after(() => {
    target[key] = original;
  });
}

function stubPendingBooking(t, customerId = 123) {
  stub(t, blockedDateModel, 'exists', async () => false);
  stub(t, blockedTimeModel, 'findOnDate', async () => []);
  stub(t, customerBookingModel, 'findAvailableServices', async () => [service]);
  stub(t, bookingManagementModel, 'findBusyIntervals', async (_executor, options) => {
    assert.ok(options.statuses.includes(BOOKING_STATUS.PENDING));
    return [{
      start: 10 * 60,
      end: 11 * 60,
      status: BOOKING_STATUS.PENDING,
      customerId,
    }];
  });
}

test('availability keeps pending times selectable and returns them for the notice', async (t) => {
  stubPendingBooking(t);

  const availability = await availabilityService.getAvailability({
    date: futureDate(),
    serviceIds: [service.id],
    executor: {},
  });

  assert.ok(SCHEDULE_CONFLICT_STATUSES.includes(BOOKING_STATUS.PENDING));
  assert.ok(availability.slots.some((slot) => slot.startTime === '10:00'));
  assert.deepEqual(availability.pendingReservations, [{ startMinute: 600, endMinute: 660 }]);
});

test('availability does not show a notice for the current customer pending booking', async (t) => {
  const customerId = 123;
  stubPendingBooking(t, customerId);

  const availability = await availabilityService.getAvailability({
    date: futureDate(),
    serviceIds: [service.id],
    executor: {},
    customerId,
  });

  assert.ok(availability.slots.some((slot) => slot.startTime === '10:00'));
  assert.deepEqual(availability.pendingReservations, []);
});

test('availability returns no pending notice when there are no bookings', async (t) => {
  stub(t, blockedDateModel, 'exists', async () => false);
  stub(t, blockedTimeModel, 'findOnDate', async () => []);
  stub(t, customerBookingModel, 'findAvailableServices', async () => [service]);
  stub(t, bookingManagementModel, 'findBusyIntervals', async () => []);

  const availability = await availabilityService.getAvailability({
    date: futureDate(),
    serviceIds: [service.id],
    executor: {},
    customerId: 123,
  });

  assert.ok(availability.slots.some((slot) => slot.startTime === '10:00'));
  assert.deepEqual(availability.pendingReservations, []);
});

test('booking submission allows a pending reservation time with an informational notice', async (t) => {
  stubPendingBooking(t);
  stub(t, bookingManagementModel, 'lockScheduleDate', async () => {});

  const schedule = await availabilityService.resolveSchedule({}, {
    date: futureDate(),
    serviceIds: [service.id],
    startTime: '10:00',
    services: [service],
  });

  assert.equal(schedule.startTime, '10:00');
  assert.equal(schedule.endTime, '11:00');
});

test('busy intervals retain booking status for customer availability messages', async () => {
  let queryText = '';
  const connection = {
    query: async (sql) => {
      queryText = sql;
      return [[{
        startMinute: 600,
        endMinute: 660,
        status: BOOKING_STATUS.PENDING,
        customerId: 123,
      }]];
    },
  };

  const intervals = await bookingManagementModel.findBusyIntervals(connection, {
    date: todayIso(),
    statuses: [BOOKING_STATUS.PENDING],
  });

  assert.match(queryText, /status,\s*customer_id AS customerId\s+FROM booking/i);
  assert.deepEqual(intervals, [{
    start: 600,
    end: 660,
    status: BOOKING_STATUS.PENDING,
    customerId: 123,
  }]);
});
