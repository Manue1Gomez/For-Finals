const test = require('node:test');
const assert = require('node:assert/strict');

const { canSetUsageLimit, getRemainingUses, getSafeCount } = require('../backend/services/voucherUsageRules');

test('remaining uses never drops below zero', () => {
  assert.equal(getRemainingUses(10, 4), 6);
  assert.equal(getRemainingUses(10, 10), 0);
  assert.equal(getRemainingUses(10, 12), 0);
});

test('invalid voucher counts are exposed as zero', () => {
  assert.equal(getSafeCount(Number.NaN), 0);
  assert.equal(getSafeCount(undefined), 0);
  assert.equal(getSafeCount('7'), 7);
  assert.equal(getRemainingUses(Number.NaN, 2), 0);
});

test('usage limit cannot be lowered below redeemed uses', () => {
  assert.equal(canSetUsageLimit(6, 6), true);
  assert.equal(canSetUsageLimit(8, 6), true);
  assert.equal(canSetUsageLimit(5, 6), false);
});
