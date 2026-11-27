const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSlots } = require('../backend/services/timeslotService');
const { BOOKING_STATUS } = require('../backend/config/bookingStatus');
const {
  getScheduleDetails,
  canAdminEditSchedule,
} = require('../backend/services/serviceScheduleRules');

test('generates whole-hour duration slots through closing time', () => {
  const slots = generateSlots({ open: '03:00', close: '22:00', durationHours: 2 });

  assert.equal(slots.length, 18);
  assert.deepEqual(slots[0], {
    startTime: '03:00',
    endTime: '05:00',
    label: '3:00 AM - 5:00 AM',
  });
  assert.equal(slots.at(-1).label, '8:00 PM - 10:00 PM');
});

test('filters overlapping slots while allowing shorter intervals to fit', () => {
  const busyIntervals = [{ start: 4 * 60, end: 6 * 60 }];

  const twoHourSlots = generateSlots({
    open: '03:00',
    close: '22:00',
    durationHours: 2,
    busyIntervals,
  });
  const oneHourSlots = generateSlots({
    open: '03:00',
    close: '22:00',
    durationHours: 1,
    busyIntervals,
  });

  assert.ok(!twoHourSlots.some((slot) => slot.startTime === '03:00' || slot.startTime === '04:00'));
  assert.ok(oneHourSlots.some((slot) => slot.startTime === '03:00' && slot.endTime === '04:00'));
  assert.ok(!oneHourSlots.some((slot) => slot.startTime === '04:00'));
});

test('a blocked hour excludes overlapping slots without blocking the adjacent hour', () => {
  const busyIntervals = [{ start: 4 * 60, end: 5 * 60 }];
  const twoHourSlots = generateSlots({
    open: '03:00',
    close: '22:00',
    durationHours: 2,
    busyIntervals,
  });
  const oneHourSlots = generateSlots({
    open: '03:00',
    close: '22:00',
    durationHours: 1,
    busyIntervals,
  });

  assert.ok(!twoHourSlots.some((slot) => ['03:00', '04:00'].includes(slot.startTime)));
  assert.ok(twoHourSlots.some((slot) => slot.startTime === '05:00'));
  assert.ok(oneHourSlots.some((slot) => slot.startTime === '03:00'));
  assert.ok(!oneHourSlots.some((slot) => slot.startTime === '04:00'));
  assert.ok(oneHourSlots.some((slot) => slot.startTime === '05:00'));
});

test('excludes slots that have already started today', () => {
  const slots = generateSlots({
    open: '03:00',
    close: '06:00',
    durationHours: 1,
    nowMinutes: 3 * 60 + 30,
  });

  assert.deepEqual(slots.map((slot) => slot.startTime), ['04:00', '05:00']);
});

test('rejects invalid durations', () => {
  assert.throws(
    () => generateSlots({ open: '03:00', close: '22:00', durationHours: 0 }),
    /durationHours/
  );
});

test('keeps Modeling Workshop exclusive in either service order', () => {
  const workshop = { name: 'Modeling Workshop', durationHours: null };
  const other = { name: 'Hair and Makeup', durationHours: 2 };

  assert.deepEqual(getScheduleDetails([workshop]), { durationHours: null, isWorkshop: true });
  assert.throws(() => getScheduleDetails([workshop, other]), /cannot be combined/);
  assert.throws(() => getScheduleDetails([other, workshop]), /cannot be combined/);
});

test('only ongoing Modeling Workshop bookings can have their schedule edited by admin', () => {
  const workshop = { name: 'Modeling Workshop', durationHours: null };
  const other = { name: 'Hair and Makeup', durationHours: 2 };

  assert.equal(canAdminEditSchedule(BOOKING_STATUS.TO_PAY, [workshop]), true);
  assert.equal(canAdminEditSchedule(BOOKING_STATUS.TO_PAY, [other]), false);
  assert.equal(canAdminEditSchedule(BOOKING_STATUS.COMPLETED, [workshop]), false);
});
