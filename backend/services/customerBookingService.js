const AppError = require('./appError');
const { pool, withTransaction } = require('../config/db');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const customerBookingModel = require('../models/customerBookingModel');
const voucherModel = require('../models/voucherModel');
const availabilityService = require('./availabilityService');
const { toCents, fromCents } = require('./money');
const { isValidIsoDate, todayIso } = require('./timeHelper');
const { isCustomerBookingDateAllowed } = require('./customerBookingRules');

const VOUCHER_CODE_PATTERN = /^[A-Z0-9]{1,30}$/;
const BOOKING_DATE_ERROR = 'Choose a date at least two days from today.';

const asText = (value) => String(value ?? '').trim();

function readServiceIds(value) {
  const ids = Array.isArray(value) ? value.map(Number) : [];
  const valid = ids.filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(valid)];
}

function readInput(body = {}) {
  const voucherRaw = asText(body.voucherCode).toUpperCase();
  return {
    serviceIds: readServiceIds(body.serviceIds),
    eventDate: asText(body.eventDate),
    startTime: asText(body.startTime),
    voucherCode: VOUCHER_CODE_PATTERN.test(voucherRaw) ? voucherRaw : null,
  };
}

function validateInput(input) {
  const errors = {};
  if (input.serviceIds.length === 0) errors.serviceIds = 'Choose at least one service.';

  if (!isValidIsoDate(input.eventDate)) errors.eventDate = 'Choose a date for your booking.';
  else if (!isCustomerBookingDateAllowed(input.eventDate, todayIso())) errors.eventDate = BOOKING_DATE_ERROR;

  if (Object.keys(errors).length > 0) {
    throw new AppError('Please fix the highlighted fields.', 400, errors);
  }
}

// Compute discount cents from a voucher row.
function computeDiscountCents(voucher, subtotalCents) {
  const raw =
    voucher.discountType === 'Percentage'
      ? Math.round((subtotalCents * Number(voucher.discountValue)) / 100)
      : toCents(Number(voucher.discountValue));
  return Math.min(raw, subtotalCents);
}

// Resolve voucher inside a transaction (booking creation).
async function resolveVoucher(connection, code, subtotalCents) {
  if (!code) return { discountCents: 0, voucherCode: null };

  const voucher = await voucherModel.findAvailableForUse(connection, code, { forUpdate: true });

  if (!voucher) {
    throw new AppError('Invalid or expired voucher code.', 400, {
      voucherCode: 'Invalid or expired voucher code.',
    });
  }

  return {
    discountCents: computeDiscountCents(voucher, subtotalCents),
    voucherCode: code,
  };
}

async function createBooking(customerId, body) {
  const input = readInput(body);
  validateInput(input);

  return withTransaction(async (connection) => {
    const services = await customerBookingModel.findAvailableServices(connection, input.serviceIds);
    const schedule = await availabilityService.resolveSchedule(connection, {
      date: input.eventDate,
      serviceIds: input.serviceIds,
      startTime: input.startTime,
      services,
    });

    const subtotalCents = services.reduce((sum, s) => sum + toCents(s.price), 0);
    const subtotal = fromCents(subtotalCents);

    const { discountCents, voucherCode } = await resolveVoucher(
      connection,
      input.voucherCode,
      subtotalCents
    );

    const discountAmount = fromCents(discountCents);
    const totalAmount   = fromCents(subtotalCents - discountCents);

    const id = await customerBookingModel.create(connection, {
      customerId,
      eventDate: input.eventDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      subtotal,
      discountAmount,
      totalAmount,
      voucherCode,
    });

    await customerBookingModel.addServices(connection, id, services);

    return {
      id,
      reference: await customerBookingModel.findReference(connection, id),
      status: BOOKING_STATUS.PENDING,
      subtotal,
      discountAmount,
      totalAmount,
      voucherCode,
    };
  });
}

// Validate a voucher code and preview the discount for a given subtotal.
// Read-only — does NOT create a booking.
async function validateVoucher(rawCode, rawSubtotal) {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!code) {
    throw new AppError('Enter a voucher code.', 400, { voucherCode: 'Enter a voucher code.' });
  }

  const subtotal = Number(rawSubtotal);
  if (!subtotal || subtotal <= 0) {
    throw new AppError('Invalid subtotal.', 400);
  }

  const subtotalCents = toCents(subtotal);
  const voucher = await voucherModel.findAvailableForUse(pool, code);

  if (!voucher) {
    throw new AppError('Invalid or expired voucher code.', 400, {
      voucherCode: 'Invalid or expired voucher code.',
    });
  }

  const discountCents = computeDiscountCents(voucher, subtotalCents);
  const totalCents    = subtotalCents - discountCents;

  return {
    voucherCode:    code,
    voucherName:    voucher.name,
    discountAmount: fromCents(discountCents),
    totalAmount:    fromCents(totalCents),
  };
}

async function getAvailability(query = {}, customerId) {
  const ids = availabilityService.readServiceIds(query.serviceIds);
  const date = asText(query.date);
  if (isValidIsoDate(date) && !isCustomerBookingDateAllowed(date, todayIso())) {
    throw new AppError(BOOKING_DATE_ERROR, 400, { date: BOOKING_DATE_ERROR });
  }
  return availabilityService.getAvailability({
    date,
    serviceIds: ids,
    executor: pool,
    customerId,
  });
}

module.exports = { createBooking, validateVoucher, getAvailability };
