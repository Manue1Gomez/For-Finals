const AppError = require('./appError');
const { pool, withTransaction } = require('../config/db');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const bookingManagementModel = require('../models/bookingManagementModel');
const voucherModel = require('../models/voucherModel');
const customerDashboardModel = require('../models/customerDashboardModel');
const rescheduleModel = require('../models/rescheduleModel');
const paymentModel = require('../models/paymentModel');
const customerModel = require('../models/customerModel');
const { splitServices } = require('../models/bookingSql');
const { toCents, fromCents } = require('./money');
const {
  requiredDownpaymentCents,
  CUSTOMER_BOOKING_STATUS,
  customerFacingBookingStatus,
} = require('./paymentRules');
const { formatTimeRange, isValidIsoDate, todayIso } = require('./timeHelper');
const netcorepayService = require('./netcorepayService');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const availabilityService = require('./availabilityService');
const { getScheduleDetails } = require('./serviceScheduleRules');
const voucherRedemptionService = require('./voucherRedemptionService');
const {
  canCustomerCancel,
  canCustomerReschedule,
  isCustomerBookingDateAllowed,
  isWithinCustomerRescheduleWindow,
} = require('./customerBookingRules');

// ─── Payment proof storage ────────────────────────────────────────────────────

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const PROOF_DIR = path.join(UPLOADS_ROOT, 'payment-proofs');
const PROOF_URL_BASE = '/uploads/payment-proofs';

const IMAGE_FORMATS = [
  {
    ext: '.jpg',
    test: (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: '.png',
    test: (b) =>
      b.length > 7 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    ext: '.webp',
    test: (b) =>
      b.length > 11 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

function detectImageExt(buffer) {
  return IMAGE_FORMATS.find((f) => f.test(buffer))?.ext ?? null;
}

async function saveProofImage(buffer) {
  const ext = detectImageExt(buffer);
  if (!ext) throw new AppError('Upload a JPG, PNG, or WebP image.', 400, { proof: 'Upload a JPG, PNG, or WebP image.' });

  const filename = `${crypto.randomUUID()}${ext}`;
  await fs.mkdir(PROOF_DIR, { recursive: true });
  await fs.writeFile(path.join(PROOF_DIR, filename), buffer);

  return `${PROOF_URL_BASE}/${filename}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBookingId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError('Booking not found.', 404);
  return id;
}

function toBookingEntry(row) {
  const totalCents = toCents(row.totalAmount);
  const paidCents = toCents(row.amountPaid);
  const downpaymentCents = requiredDownpaymentCents(totalCents);

  return {
    id: row.id,
    reference: row.reference,
    services: splitServices(row.services),
    imageUrl: row.imageUrl || null,
    eventDate: row.eventDate,
    timeLabel: formatTimeRange(row.startMinutes, row.endMinutes),
    status: row.status,
    subtotal: fromCents(toCents(row.subtotal)),
    discountAmount: fromCents(toCents(row.discountAmount || 0)),
    totalAmount: fromCents(totalCents),
    amountPaid: fromCents(paidCents),
    balance: fromCents(totalCents - paidCents),
    requiredDownpayment: fromCents(downpaymentCents),
    downpaymentPaid: paidCents >= downpaymentCents,
    voucherCode: row.voucherCode || null,
    canCancel: canCustomerCancel(row.status)
      && paidCents === 0
      && Number(row.hasPendingPayment) !== 1,
  };
}

// ─── List my bookings ─────────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  'Pending',
  'To Pay',
  CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION,
  'Confirmed',
  'Completed',
  'Rejected',
  'Cancelled',
]);

async function listBookings(customerId, rawStatus) {
  const status = rawStatus ? String(rawStatus).trim() : null;
  if (status && !VALID_STATUSES.has(status)) throw new AppError('Invalid status filter.', 400);

  const rows = await customerDashboardModel.findByCustomer(customerId);
  return rows
    .map((row) => toBookingEntry({
      ...row,
      status: customerFacingBookingStatus(row.status, Number(row.hasPendingPayment) === 1),
    }))
    .filter((booking) => !status || booking.status === status);
}

// ─── Booking details ──────────────────────────────────────────────────────────

async function getBookingDetails(customerId, rawId) {
  const id = parseBookingId(rawId);
  const booking = await customerDashboardModel.findOneByCustomer(customerId, id);
  if (!booking) throw new AppError('Booking not found.', 404);

  const [services, payments, rescheduleRequest] = await Promise.all([
    customerDashboardModel.findServicesByBooking(id),
    paymentModel.findByBooking(id),
    rescheduleModel.findLatestByBooking(id),
  ]);

  const totalCents = toCents(booking.totalAmount);
  const paidCents = toCents(booking.amountPaid);
  const downpaymentCents = requiredDownpaymentCents(totalCents);
  const hasPendingPayment = payments.some((payment) => payment.status === 'Pending' && Boolean(payment.proofUrl));
  const hasPendingPaymentIntent = payments.some((payment) => payment.status === 'Pending');
  const status = customerFacingBookingStatus(booking.status, hasPendingPayment);
  const canRescheduleStatus = [
    CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION,
    BOOKING_STATUS.CONFIRMED,
  ].includes(status);
  const today = todayIso();
  const withinRescheduleWindow = isWithinCustomerRescheduleWindow(booking.eventDate, today);
  const isWorkshop = services.some((service) => /modeling workshop/i.test(service.name));

  return {
    id: booking.id,
    reference: booking.reference,
    eventDate: booking.eventDate,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status,
    pendingPaymentReview: status === CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION && hasPendingPayment,
    subtotal: fromCents(toCents(booking.subtotal)),
    discountAmount: fromCents(toCents(booking.discountAmount || 0)),
    totalAmount: fromCents(totalCents),
    amountPaid: fromCents(paidCents),
    balance: fromCents(totalCents - paidCents),
    requiredDownpayment: fromCents(downpaymentCents),
    downpaymentPaid: paidCents >= downpaymentCents,
    voucherCode: booking.voucherCode || null,
    canCancel: canCustomerCancel(status) && paidCents === 0 && !hasPendingPaymentIntent,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      price: fromCents(toCents(s.price)),
      durationHours: s.durationHours === null ? null : Number(s.durationHours),
    })),
    canReschedule: canCustomerReschedule(status, booking.eventDate, today) && !isWorkshop,
    rescheduleUnavailableReason: canRescheduleStatus && !withinRescheduleWindow && !isWorkshop
      ? 'Reschedule requests must be submitted at least two days before the booking date.'
      : null,
    payments: payments
      .filter((payment) => payment.status !== 'Pending' || Boolean(payment.proofUrl))
      .map((p) => ({
      id: p.id,
      type: p.type,
      amount: fromCents(toCents(p.amount)),
      method: p.method,
      status: p.status,
      rejectReason: p.rejectReason,
      submittedAt: p.submittedAt,
      reviewedAt: p.reviewedAt,
      })),
    rescheduleRequest: rescheduleRequest || null,
  };
}

async function cancelBooking(customerId, rawBookingId) {
  const bookingId = parseBookingId(rawBookingId);

  await withTransaction(async (connection) => {
    const booking = await bookingManagementModel.lockById(connection, bookingId);
    if (!booking || booking.customerId !== customerId) {
      throw new AppError('Booking not found.', 404);
    }

    if (!canCustomerCancel(booking.status)) {
      throw new AppError('Only Pending and To Pay bookings can be cancelled.', 409);
    }
    if (toCents(booking.amountPaid) > 0) {
      throw new AppError('A booking with a recorded payment cannot be cancelled online.', 409);
    }
    if (await paymentModel.findPendingForBooking(connection, bookingId)) {
      throw new AppError('A GCash checkout or payment proof is still pending. Resolve it before cancelling this booking.', 409);
    }

    await voucherRedemptionService.releaseForBooking(connection, booking, { force: true });
    await bookingManagementModel.setStatus(connection, bookingId, BOOKING_STATUS.CANCELLED);
  });

  return { bookingId, status: BOOKING_STATUS.CANCELLED };
}

// ─── Submit payment ───────────────────────────────────────────────────────────

async function submitPayment(customerId, rawBookingId, file) {
  const bookingId = parseBookingId(rawBookingId);

  if (!file || !file.buffer) {
    throw new AppError('Upload a screenshot of your payment.', 400, { proof: 'Upload a screenshot of your payment.' });
  }

  const proofUrl = await saveProofImage(file.buffer);

  return withTransaction(async (connection) => {
    const booking = await bookingManagementModel.lockById(connection, bookingId);

    if (!booking || booking.customerId !== customerId) {
      throw new AppError('Booking not found.', 404);
    }

    if (!['To Pay', 'Confirmed'].includes(booking.status)) {
      throw new AppError('Payment cannot be submitted for this booking.', 409);
    }

    const totalCents = toCents(booking.totalAmount);
    const paidCents = toCents(booking.amountPaid);
    const remainingCents = totalCents - paidCents;

    if (remainingCents <= 0) throw new AppError('This booking is already fully paid.', 409);
    const type = paidCents === 0 ? 'Downpayment' : 'Balance';
    const amount = fromCents(paidCents === 0 ? requiredDownpaymentCents(totalCents) : remainingCents);
    const pending = await paymentModel.findPendingForBooking(connection, bookingId);

    if (pending) {
      const isUnsubmittedGCashCheckout =
        pending.method === 'GCash' &&
        Boolean(pending.referenceNumber) &&
        !pending.proofUrl;
      if (!isUnsubmittedGCashCheckout) {
        throw new AppError('There is already a payment awaiting review for this booking.', 409);
      }
      if (pending.type !== type || toCents(pending.amount) !== toCents(amount)) {
        throw new AppError('The booking balance changed. Refresh the booking before submitting proof.', 409);
      }
      const attached = await paymentModel.attachProof(connection, pending.id, proofUrl);
      if (!attached) {
        throw new AppError('This payment checkout has already been submitted for review.', 409);
      }
      await voucherRedemptionService.consumeForBooking(connection, booking);
      return {
        paymentId: pending.id,
        bookingId,
        type,
        amount,
        status: 'Pending',
        proofUrl,
      };
    }

    await voucherRedemptionService.consumeForBooking(connection, booking);

    const [result] = await connection.query(
      `INSERT INTO payment (booking_id, payment_type, amount, method, proof_path, status, submitted_at)
       VALUES (?, ?, ?, 'GCash', ?, 'Pending', NOW())`,
      [bookingId, type, amount, proofUrl]
    );

    return {
      paymentId: result.insertId,
      bookingId,
      type,
      amount,
      status: 'Pending',
      proofUrl,
    };
  });
}

function getAppBaseUrl() {
  const configuredUrl = process.env.APP_BASE_URL;
  if (!configuredUrl) {
    throw new AppError('GCash payments are not configured. Please contact the studio.', 503);
  }

  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new AppError('GCash payments are not configured. Please contact the studio.', 503);
  }

  const localHost = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') ||
    (!localHost && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new AppError('GCash payments are not configured. Please contact the studio.', 503);
  }

  return url.origin;
}

function isLocalCheckoutKey(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

async function startGCashPayment(customerId, rawBookingId) {
  const bookingId = parseBookingId(rawBookingId);
  const appBaseUrl = getAppBaseUrl();

  if (!netcorepayService.isConfigured()) {
    throw new AppError('GCash payments are not configured. Please contact the studio.', 503);
  }

  const intent = await withTransaction(async (connection) => {
    const booking = await bookingManagementModel.lockById(connection, bookingId);
    if (!booking || booking.customerId !== customerId) throw new AppError('Booking not found.', 404);
    if (!['To Pay', 'Confirmed'].includes(booking.status)) {
      throw new AppError('Payment cannot be started for this booking.', 409);
    }

    const totalCents = toCents(booking.totalAmount);
    const paidCents = toCents(booking.amountPaid);
    const remainingCents = totalCents - paidCents;
    if (remainingCents <= 0) throw new AppError('This booking is already fully paid.', 409);

    const type = paidCents === 0 ? 'Downpayment' : 'Balance';
    const amountCents = paidCents === 0 ? requiredDownpaymentCents(totalCents) : remainingCents;
    const existing = await paymentModel.findPendingForBooking(connection, bookingId);

    if (existing) {
      if (existing.proofUrl) {
        throw new AppError('Your payment proof is awaiting studio review. Check My Bookings for updates.', 409);
      }
      const localKey = isLocalCheckoutKey(existing.referenceNumber);
      const providerPayment = /^pay_[A-Za-z0-9_-]{1,45}$/.test(existing.referenceNumber || '');
      if (
        existing.method !== 'GCash' ||
        (!localKey && !providerPayment) ||
        toCents(existing.amount) !== amountCents
      ) {
        throw new AppError('There is already a payment awaiting verification or completion for this booking.', 409);
      }

      await voucherRedemptionService.consumeForBooking(connection, booking);
      return {
        paymentId: existing.id,
        type: existing.type,
        amountCents,
        idempotencyKey: localKey ? existing.referenceNumber : null,
        providerPaymentId: providerPayment ? existing.referenceNumber : null,
      };
    }

    const idempotencyKey = crypto.randomUUID();
    const paymentId = await paymentModel.createPendingGatewayPayment(connection, {
      bookingId,
      type,
      amount: fromCents(amountCents),
      idempotencyKey,
    });

    await voucherRedemptionService.consumeForBooking(connection, booking);
    return { paymentId, type, amountCents, idempotencyKey, providerPaymentId: null };
  });

  const returnUrl = new URL('/customer/html/my-bookings.html', appBaseUrl);
  returnUrl.searchParams.set('gcash', 'returned');
  returnUrl.searchParams.set('booking', String(bookingId));
  returnUrl.searchParams.set('payment', String(intent.paymentId));

  let payment;
  try {
    payment = intent.providerPaymentId
      ? await netcorepayService.getPayment(intent.providerPaymentId, intent.amountCents)
      : await netcorepayService.createGCashPayment({
        amountCents: intent.amountCents,
        description: `BRB Studio booking ${bookingId} ${intent.type.toLowerCase()}`,
        returnUrl: returnUrl.toString(),
        metadata: {
          booking_id: String(bookingId),
          payment_record_id: String(intent.paymentId),
          checkout_key: intent.idempotencyKey,
        },
        idempotencyKey: intent.idempotencyKey,
      });
  } catch (error) {
    console.error(`Could not create or retrieve the NetCorePay checkout: ${error.message}`);
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      await withTransaction(async (connection) => {
        const booking = await bookingManagementModel.lockById(connection, bookingId);
        await paymentModel.markGatewayRejected(
          connection,
          intent.paymentId,
          intent.providerPaymentId || intent.idempotencyKey,
          'NetCorePay could not create or retrieve the checkout.'
        );
        await voucherRedemptionService.releaseIfNoActivePayment(connection, booking);
      });
    }
    throw new AppError('Could not start GCash checkout. Please try again in a moment.', 502);
  }

  if (intent.providerPaymentId && ['failed', 'expired', 'cancelled', 'canceled', 'refunded'].includes(payment.status)) {
    let reason = 'NetCorePay reported that the payment failed.';
    if (payment.status === 'expired') {
      reason = 'NetCorePay checkout expired before payment was completed.';
    } else if (payment.status === 'refunded') {
      reason = 'NetCorePay payment was refunded before local confirmation.';
    } else if (payment.status === 'cancelled' || payment.status === 'canceled') {
      reason = 'NetCorePay checkout was cancelled before payment was completed.';
    }
    await withTransaction(async (connection) => {
      const booking = await bookingManagementModel.lockById(connection, bookingId);
      await paymentModel.markGatewayRejected(
        connection,
        intent.paymentId,
        intent.providerPaymentId,
        reason
      );
      await voucherRedemptionService.releaseIfNoActivePayment(connection, booking);
    });
    throw new AppError('The previous GCash checkout is no longer active. Try again to start a new one.', 409);
  }

  if (intent.idempotencyKey) {
    const updated = await withTransaction((connection) =>
      paymentModel.updateGatewayReference(
        connection,
        intent.paymentId,
        intent.idempotencyKey,
        payment.id
      )
    );

    if (!updated) {
      const current = await paymentModel.findById(intent.paymentId);
      if (!current || current.status === 'Rejected') {
        throw new AppError('This GCash payment is no longer available. Refresh the booking and try again.', 409);
      }
    }
  }

  if (payment.status === 'succeeded') {
    throw new AppError('GCash checkout is complete. Upload your payment screenshot for studio verification.', 409);
  }

  return {
    paymentId: intent.paymentId,
    amount: fromCents(intent.amountCents),
    checkoutUrl: payment.checkout_url,
  };
}

// ─── Apply voucher ────────────────────────────────────────────────────────────

async function applyVoucher(customerId, rawBookingId, rawCode) {
  const bookingId = parseBookingId(rawBookingId);
  const code = String(rawCode ?? '').trim().toUpperCase();

  if (!code) throw new AppError('Enter a voucher code.', 400, { voucherCode: 'Enter a voucher code.' });

  return withTransaction(async (connection) => {
    const booking = await bookingManagementModel.lockById(connection, bookingId);

    if (!booking || booking.customerId !== customerId) throw new AppError('Booking not found.', 404);
    if (booking.status !== BOOKING_STATUS.TO_PAY) {
      throw new AppError('Vouchers can only be applied to bookings awaiting payment.', 409);
    }
    if (booking.voucherCode) throw new AppError('A voucher has already been applied to this booking.', 409);

    const voucher = await voucherModel.findAvailableForUse(connection, code, { forUpdate: true });

    if (!voucher) {
      throw new AppError('Invalid or expired voucher code.', 400, { voucherCode: 'Invalid or expired voucher code.' });
    }

    const subtotalCents = toCents(booking.totalAmount);
    const discountCents =
      voucher.discountType === 'Percentage'
        ? Math.round((subtotalCents * Number(voucher.discountValue)) / 100)
        : toCents(Number(voucher.discountValue));

    const finalDiscountCents = Math.min(discountCents, subtotalCents);
    const newTotalCents = subtotalCents - finalDiscountCents;

    await connection.query(
      'UPDATE booking SET voucher_code = ?, discount_amount = ?, total_amount = ? WHERE booking_id = ?',
      [code, fromCents(finalDiscountCents), fromCents(newTotalCents), bookingId]
    );

    return {
      bookingId,
      voucherCode: code,
      discountAmount: fromCents(finalDiscountCents),
      totalAmount: fromCents(newTotalCents),
    };
  });
}

// ─── Reschedule request ───────────────────────────────────────────────────────

async function requestReschedule(customerId, rawBookingId, body) {
  const bookingId = parseBookingId(rawBookingId);
  const newDate = String(body?.newDate ?? '').trim();
  const newStartTime = String(body?.newStartTime ?? '').trim();
  const today = todayIso();

  const errors = {};
  if (!isValidIsoDate(newDate)) errors.newDate = 'Choose a valid date.';
  else if (!isCustomerBookingDateAllowed(newDate, today)) errors.newDate = 'Choose a date at least two days from today.';
  if (Object.keys(errors).length > 0) throw new AppError('Please fix the highlighted fields.', 400, errors);

  return withTransaction(async (connection) => {
    const booking = await bookingManagementModel.lockById(connection, bookingId);

    if (!booking || booking.customerId !== customerId) throw new AppError('Booking not found.', 404);

    const pendingPayment = await paymentModel.findPendingForBooking(connection, bookingId);
    const customerStatus = customerFacingBookingStatus(booking.status, Boolean(pendingPayment?.proofUrl));
    if (!canCustomerReschedule(customerStatus, booking.eventDate, today)) {
      const message = [CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION, BOOKING_STATUS.CONFIRMED].includes(customerStatus)
        ? 'Reschedule requests must be submitted at least two days before the booking date.'
        : 'Only For Verification and Confirmed bookings can be rescheduled.';
      throw new AppError(message, 409, { newDate: message });
    }

    const services = await bookingManagementModel.findBookingServices(connection, bookingId);
    if (getScheduleDetails(services).isWorkshop) {
      throw new AppError(
        'Modeling Workshop can only be rescheduled by the studio owner.',
        409,
        { newDate: 'Modeling Workshop can only be rescheduled by the studio owner.' }
      );
    }
    if (!newStartTime) {
      throw new AppError('Choose an available time slot.', 400, {
        newStartTime: 'Choose an available time slot.',
      });
    }

    const schedule = await availabilityService.resolveSchedule(connection, {
      date: newDate,
      serviceIds: services.map((service) => service.id),
      services,
      startTime: newStartTime,
      bookingId,
    });

    if (newDate === booking.eventDate && schedule.startTime === booking.startTime && schedule.endTime === booking.endTime) {
      throw new AppError('Choose a different date or time from your current schedule.', 400, {
        newDate: 'Choose a different date or time from your current schedule.',
      });
    }

    // One open request per booking: a new submission replaces the pending one
    const requested = { date: newDate, startTime: schedule.startTime, endTime: schedule.endTime };
    const pendingId = await rescheduleModel.findPendingIdByBooking(connection, bookingId);

    if (pendingId) {
      await rescheduleModel.updatePending(connection, pendingId, requested);
    } else {
      await rescheduleModel.create(connection, {
        bookingId,
        old: { date: booking.eventDate, startTime: booking.startTime, endTime: booking.endTime },
        requested,
      });
    }

    return {
      bookingId,
      newDate,
      newStartTime: schedule.startTime,
      newEndTime: schedule.endTime,
      rescheduleStatus: 'Pending',
    };
  });
}

async function getRescheduleAvailability(customerId, rawBookingId, rawDate) {
  const bookingId = parseBookingId(rawBookingId);
  const date = String(rawDate ?? '').trim();
  const today = todayIso();
  const booking = await customerDashboardModel.findOneByCustomer(customerId, bookingId);
  if (!booking) throw new AppError('Booking not found.', 404);
  const hasPendingPayment = await paymentModel.hasPendingPaymentForBooking(pool, bookingId);
  const customerStatus = customerFacingBookingStatus(booking.status, hasPendingPayment);
  if (!canCustomerReschedule(customerStatus, booking.eventDate, today)) {
    const message = [CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION, BOOKING_STATUS.CONFIRMED].includes(customerStatus)
      ? 'Reschedule requests must be submitted at least two days before the booking date.'
      : 'Only For Verification and Confirmed bookings can be rescheduled.';
    throw new AppError(message, 409);
  }

  const services = await bookingManagementModel.findBookingServices(pool, bookingId);
  if (getScheduleDetails(services).isWorkshop) {
    throw new AppError('Modeling Workshop can only be rescheduled by the studio owner.', 409);
  }
  if (isValidIsoDate(date) && !isCustomerBookingDateAllowed(date, today)) {
    const message = 'Choose a date at least two days from today.';
    throw new AppError(message, 400, { date: message });
  }

  return availabilityService.getAvailability({
    date,
    serviceIds: services.map((service) => service.id),
    executor: pool,
    excludeBookingId: bookingId,
    services,
  });
}

// ─── Update profile ───────────────────────────────────────────────────────────

const NAME_PATTERN = /^\p{L}[\p{L} .'-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^09\d{9}$/;

function validateProfileFields(data) {
  const errors = {};

  if (!data.firstName) errors.firstName = 'First name is required.';
  else if (data.firstName.length > 50) errors.firstName = 'First name must be 50 characters or fewer.';
  else if (!NAME_PATTERN.test(data.firstName)) errors.firstName = "First name can only contain letters, spaces, apostrophes and hyphens.";

  if (!data.lastName) errors.lastName = 'Last name is required.';
  else if (data.lastName.length > 50) errors.lastName = 'Last name must be 50 characters or fewer.';
  else if (!NAME_PATTERN.test(data.lastName)) errors.lastName = "Last name can only contain letters, spaces, apostrophes and hyphens.";

  if (!data.email) errors.email = 'Email address is required.';
  else if (data.email.length > 100 || !EMAIL_PATTERN.test(data.email)) errors.email = 'Enter a valid email address.';

  if (!data.contactNumber) errors.contactNumber = 'Contact number is required.';
  else if (!CONTACT_PATTERN.test(data.contactNumber)) errors.contactNumber = 'Enter a valid mobile number, e.g. 09123456789.';

  return errors;
}

const MYSQL_DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

async function updateProfile(customerId, body) {
  const data = {
    firstName: String(body?.firstName ?? '').trim(),
    lastName: String(body?.lastName ?? '').trim(),
    email: String(body?.email ?? '').trim().toLowerCase(),
    contactNumber: String(body?.contactNumber ?? '').replace(/[\s-]/g, ''),
  };

  const errors = validateProfileFields(data);
  if (Object.keys(errors).length > 0) throw new AppError('Please fix the highlighted fields.', 400, errors);

  try {
    await pool.query(
      'UPDATE customer SET f_name = ?, l_name = ?, email = ?, contact_num = ? WHERE customer_id = ?',
      [data.firstName, data.lastName, data.email, data.contactNumber, customerId]
    );
  } catch (error) {
    if (error.code === MYSQL_DUPLICATE_ENTRY) {
      throw new AppError('This email is already registered.', 409, { email: 'This email is already registered.' });
    }
    throw error;
  }

  return { firstName: data.firstName, lastName: data.lastName, email: data.email, contactNumber: data.contactNumber };
}

// ─── Change password ──────────────────────────────────────────────────────────

function validateNewPassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

async function changePassword(customerId, body) {
  const currentPassword = String(body?.currentPassword ?? '');
  const newPassword = String(body?.newPassword ?? '');
  const confirmPassword = String(body?.confirmPassword ?? '');

  const errors = {};
  if (!currentPassword) errors.currentPassword = 'Current password is required.';

  const newError = validateNewPassword(newPassword);
  if (newError) errors.newPassword = newError;

  if (!errors.newPassword && newPassword !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (Object.keys(errors).length > 0) throw new AppError('Please fix the highlighted fields.', 400, errors);

  const [[row]] = await pool.query('SELECT password AS passwordHash FROM customer WHERE customer_id = ?', [customerId]);
  if (!row) throw new AppError('Account not found.', 404);

  const matches = await bcrypt.compare(currentPassword, row.passwordHash);
  if (!matches) {
    throw new AppError('Please fix the highlighted fields.', 400, { currentPassword: 'Current password is incorrect.' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE customer SET password = ? WHERE customer_id = ?', [newHash, customerId]);

  return { message: 'Password updated successfully.' };
}

// ─── Get profile ──────────────────────────────────────────────────────────────

async function getProfile(customerId) {
  const [[row]] = await pool.query(
    `SELECT f_name AS firstName, l_name AS lastName, email, contact_num AS contactNumber
       FROM customer WHERE customer_id = ?`,
    [customerId]
  );
  if (!row) throw new AppError('Account not found.', 404);
  return row;
}

module.exports = {
  listBookings,
  getBookingDetails,
  cancelBooking,
  submitPayment,
  startGCashPayment,
  applyVoucher,
  requestReschedule,
  getRescheduleAvailability,
  updateProfile,
  changePassword,
  getProfile,
};
