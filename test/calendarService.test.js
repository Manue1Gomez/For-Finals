const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHourlyBlock } = require('../backend/services/calendarService');

test('creates one-hour blocks within operating hours', () => {
  assert.deepEqual(parseHourlyBlock('03:00'), {
    startTime: '03:00',
    endTime: '04:00',
    start: 180,
    end: 240,
  });
  assert.deepEqual(parseHourlyBlock('21:00'), {
    startTime: '21:00',
    endTime: '22:00',
    start: 1260,
    end: 1320,
  });
});

test('rejects partial-hour and out-of-hours block times', () => {
  for (const startTime of ['02:00', '03:30', '22:00']) {
    assert.throws(
      () => parseHourlyBlock(startTime),
      (error) => error.status === 400
    );
  }
});
