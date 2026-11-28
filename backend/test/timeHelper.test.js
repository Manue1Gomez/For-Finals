const test = require('node:test');
const assert = require('node:assert/strict');
const { businessDateIso, businessTimeMinutes } = require('../services/timeHelper');

test('calendar business date and time use Philippine time', () => {
  const utcDate = new Date('2026-11-27T16:30:00.000Z');

  assert.equal(businessDateIso(utcDate), '2026-11-28');
  assert.equal(businessTimeMinutes(utcDate), 30);
});
