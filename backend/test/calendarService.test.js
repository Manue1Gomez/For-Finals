const test = require('node:test');
const assert = require('node:assert/strict');
const calendarService = require('../services/calendarService');
const bookingModel = require('../models/bookingModel');
const blockedDateModel = require('../models/blockedDateModel');
const { BOOKING_STATUS } = require('../config/bookingStatus');

function stub(t, target, key, implementation) {
  const original = target[key];
  target[key] = implementation;
  t.after(() => {
    target[key] = original;
  });
}

test('month overview includes dates with admin bookings and blocked dates', async (t) => {
  stub(t, bookingModel, 'findBookedDates', async (_start, _end, statuses) => {
    assert.ok(statuses.includes(BOOKING_STATUS.PENDING));
    return ['2026-11-27'];
  });
  stub(t, blockedDateModel, 'findBetween', async () => ['2026-11-28']);

  const overview = await calendarService.getMonthOverview('2026-11');

  assert.deepEqual(overview, {
    month: '2026-11',
    bookedDates: ['2026-11-27'],
    blockedDates: ['2026-11-28'],
  });
});

test('creates one-hour blocks within operating hours', () => {
  assert.deepEqual(calendarService.parseHourlyBlock('03:00'), {
    startTime: '03:00',
    endTime: '04:00',
    start: 180,
    end: 240,
  });
  assert.deepEqual(calendarService.parseHourlyBlock('21:00'), {
    startTime: '21:00',
    endTime: '22:00',
    start: 1260,
    end: 1320,
  });
});

test('rejects partial-hour and out-of-hours block times', () => {
  for (const startTime of ['02:00', '03:30', '22:00']) {
    assert.throws(
      () => calendarService.parseHourlyBlock(startTime),
      (error) => error.status === 400
    );
  }
});
