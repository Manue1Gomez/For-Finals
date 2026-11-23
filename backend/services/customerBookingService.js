const AppError = require('./appError');
const { pool, withTransaction } = require('../config/db');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const { BOOKING_HOURS, SCHEDULE_CONFLICT_STATUSES } = require('../config/bookingRules');
const blockedDateModel = require('../models/blockedDateModel');
const bookingManagementModel = require('../models/bookingManagementModel');
const customerBookingModel = require('../models/customerBookingModel');
const { toCents, fromCents } = require('./money');
const { isValidIsoDate, timeTextToMinutes, todayIso } = require('./timeHelper');

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VOUCHER_CODE_PATTERN = /^[A-Z0-9]{1,30}$/;

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
    endTime: asText(body.endTime),
    voucherCode: VOUCHER_CODE_PATTERN.test(voucherRaw) ? voucherRaw : null,
  };
}

function validateInput(input) {
  const errors = {};
  const opens = timeTextToMinutes(BOOKING_HOURS.open);
  const closes = timeTextToMinutes(BOOKING_HOURS.close);

  if (input.serviceIds.length === 0) errors.serviceIds = 'Choose at least one service.';

  if (!isValidIsoDate(input.eventDate)) errors.eventDate = 'Choose a date for your booking.';
  else if (input.eventDate < todayIso()) errors.eventDate = 'Choose today or a later date.';

  if (!TIME_PATTERN.test(input.startTime)) errors.startTime = 'Choose a start time.';
  if (!TIME_PATTERN.test(input.endTime)) errors.endTime = 'Choose an end time.';

  if (!errors.startTime && !errors.endTime) {
    const start = timeTextToMinutes(input.startTime);
    const end = timeTextToMinutes(input.endTime);

    if (end <= start) errors.endTime = 'End time must be later than the start time.';
    else if (start < opens || end > closes) {
      errors.startTime = `Bookings are accepted from ${BOOKING_HOURS.open} to ${BOOKING_HOURS.close} only.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new AppError('Please fix the highlighted fields.', 400, errors);
  }
}

async function assertScheduleAvailable(connection, input) {
  if (await blockedDateModel.exists(input.eventDate)) {
    const message = 'This date is not available, choose other schedule.';
    throw new AppError(message, 409, { eventDate: message });
  }

  const conflict = await bookingManagementModel.findConflict(connection, {
    bookingId: 0,
    date: input.eventDate,
    startTime: input.startTime,
    endTime: input.endTime,
    serviceIds: input.serviceIds,
    statuses: SCHEDULE_CONFLICT_STATUSES,
  });

  if (conflict) {
    const message = 'This date or time is not available, choose other schedule.';
    throw new AppError(message, 409, { schedule: message });
  }
}

// Shared: fetch a valid voucher row by code using a given query executor (pool or connection).
async function fetchVoucherRow(executor, code) {
  const [[row]] = await executor.query(
    `SELECT discount_type  AS discountType,
            discount_value AS discountValue,
            voucher_name   AS name
       FROM voucher
      WHERE voucher_code = ?
        AND CURDATE() BETWEEN start_date AND end_date
        AND usage_limit > (SELECT COUNT(*) FROM booking b WHERE b.voucher_code = ?)`,
    [code, code]
  );
  return row ?? null;
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

  const voucher = await fetchVoucherRow(connection, code);

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

    if (services.length !== input.serviceIds.length) {
      const message = 'One of the selected services is no longer available.';
      throw new AppError(message, 409, { serviceIds: message });
    }

    await assertScheduleAvailable(connection, input);

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
      startTime: input.startTime,
      endTime: input.endTime,
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
  const voucher = await fetchVoucherRow(pool, code);

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

module.exports = { createBooking, validateVoucher };
