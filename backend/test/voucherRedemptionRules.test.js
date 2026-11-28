const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldConsumeVoucher,
  shouldReleaseVoucher,
} = require('../services/voucherRedemptionRules');

test('a voucher is consumed only once per booking with a code', () => {
  assert.equal(shouldConsumeVoucher({ voucherCode: 'SAVE10', voucherConsumed: false }), true);
  assert.equal(shouldConsumeVoucher({ voucherCode: 'SAVE10', voucherConsumed: true }), false);
  assert.equal(shouldConsumeVoucher({ voucherCode: null, voucherConsumed: false }), false);
});

test('voucher use is released when the last pending payment is rejected or booking is rejected', () => {
  const booking = { voucherCode: 'SAVE10', voucherConsumed: true };
  assert.equal(shouldReleaseVoucher(booking, false), true);
  assert.equal(shouldReleaseVoucher(booking, true), false);
  assert.equal(shouldReleaseVoucher(booking, true, true), true);
});
