const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPrice } = require('../backend/services/serviceManagementService');

test('accepts only whole-peso service prices from 1000 to 9999', () => {
  assert.equal(isValidPrice('1000'), true);
  assert.equal(isValidPrice('9999'), true);
  assert.equal(isValidPrice('999'), false);
  assert.equal(isValidPrice('10000'), false);
  assert.equal(isValidPrice('1000abc'), false);
  assert.equal(isValidPrice('1,000'), false);
  assert.equal(isValidPrice('1000.50'), false);
});
