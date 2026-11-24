const bcrypt = require('bcryptjs');
const AppError = require('./appError');
const { withTransaction } = require('../config/db');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const { SCHEDULE_CONFLICT_STATUSES, BOOKING_HOURS } = require('../config/bookingRules');
const customerModel = require('../models/customerModel');
const customerBookingModel = require('../models/customerBookingModel');
const bookingManagementModel = require('../models/bookingManagementModel');
const blockedDateModel = require('../models/blockedDateModel');
const paymentModel = require('../models/paymentModel');
const { toCents, fromCents, parseAmountToCents } = require('./money');
const { isValidIsoDate, timeTextToMinutes, todayIso } = require('./timeHelper');
const { statusAfterPayment, requiredDownpaymentCents } = require('./paymentRules');

const SALT_ROUNDS = 10;
const MYSQL_DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

const NAME_RE = /^\p{L}[\p{L} .'-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_RE = /^09\d{9}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const asText = (v) => String(v ?? '').trim();

// ── Validate new customer fields ─────────────────────────────────────

function validateNewCustomer(c) {
  const errors = {};

  if (!c.firstName) errors.firstName = 'First name is required.';
  else if (c.firstName.length > 50) errors.firstName = 'First name must be 50 characters or fewer.';
  else if (!NAME_RE.test(c.firstName)) errors.firstName = 'First name can only contain letters, spaces, apostrophes and hyphens.';

  if (!c.lastName) errors.lastName = 'Last name is required.';
  else if (c.lastName.length > 50) errors.lastName = 'Last name must be 50 characters or fewer.';
  else if (!NAME_RE.test(c.lastName)) errors.lastName = 'Last name can only contain letters, spaces, apostrophes and hyphens.';

  if (!c.email) errors.email = 'Email address is required.';
  else if (!EMAIL_RE.test(c.email)) errors.email = 'Enter a valid email address.';

  if (!c.contactNumber) errors.contactNumber = 'Contact number is required.';
  else if (!CONTACT_RE.test(c.contactNumber)) errors.contactNumber = 'Enter a valid mobile number, e.g. 09123456789.';

  if (!c.password) errors.password = 'Password is required.';
  else if (c.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (c.password.length > 72) errors.password = 'Password must be 72 characters or fewer.';
  else if (!/[A-Za-z]/.test(c.password) || !/\d/.test(c.password)) {
    errors.password = 'Password must contain at least one letter and one number.';
  }

  return errors;
}

// ── Validate booking fields ───────────────────────────────────────────

function validateBookingInput(b) {
  const errors = {};
  const opens = timeTextToMinutes(BOOKING_HOURS.open);
  const closes = timeTextToMinutes(BOOKING_HOURS.close);
  const today = todayIso();

  if (!Array.isArray(b.serviceIds) || b.serviceIds.length === 0) {
    errors.serviceIds = 'Choose at least one service.';
  }

  if (!isValidIsoDate(b.eventDate)) errors.eventDate = 'Choose a valid event date.';
  else if (b.eventDate < today) errors.eventDate = 'Choose today or a later date.';

  if (!TIME_RE.test(b.startTime)) errors.startTime = 'Choose a valid start time.';
  if (!TIME_RE.test(b.endTime)) errors.endTime = 'Choose a valid end time.';

  if (!errors.startTime && !errors.endTime) {
    const start = timeTextToMinutes(b.startTime);
    const end = timeTextToMinutes(b.endTime);
    if (end <= start) errors.endTime = 'End time must be later than the start time.';
    else if (start < opens || end > closes) {
      errors.startTime = `Bookings are accepted from ${BOOKING_HOURS.open} to ${BOOKING_HOURS.close} only.`;
    }
  }

  return errors;
}

// ── Validate payment fields ───────────────────────────────────────────

function validatePaymentInput(p, totalCents) {
  const errors = {};
  const METHODS = ['Cash', 'GCash'];

  if (!METHODS.includes(p.method)) errors.method = 'Choose how the payment was received.';

  if (!p.markFullyPaid) {
    const amountCents = parseAmountToCents(p.amount);
    if (amountCents === null) {
      errors.amount = 'Enter a valid amount greater than 0.';
    } else {
      const requiredCents = requiredDownpaymentCents(totalCents);
      if (amountCents < requiredCents) {
        errors.amount = `Minimum downpayment is 50% (${fromCents(requiredCents)}).`;
      }
    }
  }

  return errors;
}

// ── Main function ─────────────────────────────────────────────────────

async function createWalkInBooking(body = {}) {
  const customerInput = body.customer ?? {};
  const bookingInput  = body.booking ?? {};
  const paymentInput  = body.payment ?? {};

  // Normalize customer
  const isNew = customerInput.type === 'new';
  const newCustomer = isNew ? {
    firstName:     asText(customerInput.firstName),
    lastName:      asText(customerInput.lastName),
    email:         asText(customerInput.email).toLowerCase(),
    contactNumber: asText(customerInput.contactNumber).replace(/[\s-]/g, ''),
    password:      asText(customerInput.password),
  } : null;

  const existingId = isNew ? null : Number(customerInput.id);

  // Normalize booking
  const booking = {
    serviceIds: Array.isArray(bookingInput.serviceIds)
      ? [...new Set(bookingInput.serviceIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
      : [],
    eventDate:    asText(bookingInput.eventDate),
    startTime:    asText(bookingInput.startTime),
    endTime:      asText(bookingInput.endTime),
    eventAddress: asText(bookingInput.eventAddress) || null,
    voucherCode:  asText(bookingInput.voucherCode).toUpperCase() || null,
  };

  // Normalize payment
  const payment = {
    method:         asText(paymentInput.method),
    markFullyPaid:  paymentInput.markFullyPaid === true || paymentInput.markFullyPaid === 'true',
    amount:         paymentInput.amount ?? null,
    note:           asText(paymentInput.note) || null,
  };

  // Validate customer section
  const allErrors = {};

  if (isNew) {
    Object.assign(allErrors, validateNewCustomer(newCustomer));
  } else if (!Number.isInteger(existingId) || existingId < 1) {
    throw new AppError('Customer not found.', 404);
  }

  // Validate booking section
  Object.assign(allErrors, validateBookingInput(booking));

  if (Object.keys(allErrors).length > 0) {
    throw new AppError('Please fix the highlighted fields.', 400, allErrors);
  }

  return withTransaction(async (connection) => {
    // ── Resolve customer ID ──────────────────────────────────────
    let customerId;

    if (isNew) {
      if (await customerModel.findByEmail(newCustomer.email)) {
        throw new AppError('This email is already registered.', 409, {
          email: 'This email is already registered.',
        });
      }

      const passwordHash = await bcrypt.hash(newCustomer.password, SALT_ROUNDS);

      try {
        customerId = await customerModel.create({ ...newCustomer, passwordHash });
      } catch (error) {
        if (error.code === MYSQL_DUPLICATE_ENTRY) {
          throw new AppError('This email is already registered.', 409, {
            email: 'This email is already registered.',
          });
        }
        throw error;
      }
    } else {
      // Verify the existing customer still exists
      const [[customerRow]] = await connection.query(
        'SELECT customer_id FROM customer WHERE customer_id = ?',
        [existingId]
      );
      if (!customerRow) throw new AppError('Customer not found.', 404);
      customerId = existingId;
    }

    // ── Resolve services ─────────────────────────────────────────
    const services = await customerBookingModel.findAvailableServices(connection, booking.serviceIds);

    if (services.length !== booking.serviceIds.length) {
      throw new AppError('One of the selected services is no longer available.', 409, {
        serviceIds: 'One of the selected services is no longer available.',
      });
    }

    // ── Check schedule ───────────────────────────────────────────
    if (await blockedDateModel.exists(booking.eventDate)) {
      throw new AppError('This date is blocked on the calendar.', 409, {
        eventDate: 'This date is blocked on the calendar.',
      });
    }

    const conflict = await bookingManagementModel.findConflict(connection, {
      bookingId: 0,
      date: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      serviceIds: booking.serviceIds,
      statuses: SCHEDULE_CONFLICT_STATUSES,
    });

    if (conflict) {
      throw new AppError('This schedule conflicts with an existing booking.', 409, {
        startTime: 'This schedule conflicts with an existing booking.',
      });
    }

    // ── Compute totals ───────────────────────────────────────────
    const subtotalCents = services.reduce((sum, s) => sum + toCents(s.price), 0);
    let discountCents = 0;
    let appliedVoucher = null;

    if (booking.voucherCode) {
      const [[voucherRow]] = await connection.query(
        `SELECT discount_type AS discountType, discount_value AS discountValue
           FROM voucher
          WHERE voucher_code = ?
            AND CURDATE() BETWEEN start_date AND end_date
            AND usage_limit > (SELECT COUNT(*) FROM booking b WHERE b.voucher_code = ?)`,
        [booking.voucherCode, booking.voucherCode]
      );

      if (voucherRow) {
        discountCents = voucherRow.discountType === 'Percentage'
          ? Math.round((subtotalCents * Number(voucherRow.discountValue)) / 100)
          : toCents(Number(voucherRow.discountValue));
        discountCents = Math.min(discountCents, subtotalCents);
        appliedVoucher = booking.voucherCode;
      }
    }

    const totalCents = subtotalCents - discountCents;

    // ── Validate payment now that we have the total ──────────────
    const paymentErrors = validatePaymentInput(payment, totalCents);
    if (Object.keys(paymentErrors).length > 0) {
      throw new AppError('Please fix the highlighted fields.', 400, paymentErrors);
    }

    const amountCents = payment.markFullyPaid
      ? requiredDownpaymentCents(totalCents)
      : parseAmountToCents(payment.amount);

    // ── Create booking ───────────────────────────────────────────
    const bookingId = await customerBookingModel.create(connection, {
      customerId,
      eventDate:      booking.eventDate,
      startTime:      booking.startTime,
      endTime:        booking.endTime,
      subtotal:       fromCents(subtotalCents),
      discountAmount: fromCents(discountCents),
      totalAmount:    fromCents(totalCents),
      voucherCode:    appliedVoucher,
    });

    await customerBookingModel.addServices(connection, bookingId, services);

    // Walk-in bookings skip the pending/to-pay flow — set directly to Confirmed
    await bookingManagementModel.setStatus(connection, bookingId, BOOKING_STATUS.CONFIRMED);

    // ── Record downpayment ───────────────────────────────────────
    const paidAfterCents = amountCents;
    const bookingStatusAfter = statusAfterPayment(BOOKING_STATUS.CONFIRMED, paidAfterCents, totalCents);

    await paymentModel.insertVerifiedByAdmin(connection, {
      bookingId,
      type:   'Downpayment',
      amount: fromCents(amountCents),
      method: payment.method,
      note:   payment.note,
    });

    await bookingManagementModel.addToPaid(connection, bookingId, fromCents(amountCents));

    if (bookingStatusAfter !== BOOKING_STATUS.CONFIRMED) {
      await bookingManagementModel.setStatus(connection, bookingId, bookingStatusAfter);
    }

    const reference = await customerBookingModel.findReference(connection, bookingId);

    return {
      bookingId,
      reference,
      bookingStatus: bookingStatusAfter,
      totalAmount:   fromCents(totalCents),
      amountPaid:    fromCents(amountCents),
      balance:       fromCents(totalCents - amountCents),
    };
  });
}

module.exports = { createWalkInBooking };
