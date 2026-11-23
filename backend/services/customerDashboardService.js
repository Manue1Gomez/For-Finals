const AppError = require('./appError');
const { pool, withTransaction } = require('../config/db');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const { SCHEDULE_CONFLICT_STATUSES, BOOKING_HOURS } = require('../config/bookingRules');
const blockedDateModel = require('../models/blockedDateModel');
const bookingManagementModel = require('../models/bookingManagementModel');
const customerDashboardModel = require('../models/customerDashboardModel');
const paymentModel = require('../models/paymentModel');
const customerModel = require('../models/customerModel');
const { splitServices } = require('../models/bookingSql');
const { toCents, fromCents } = require('./money');
const { requiredDownpaymentCents } = require('./paymentRules');
const { formatTimeRange, timeTextToMinutes, isValidIsoDate, todayIso } = require('./timeHelper');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ─── Payment proof storage ────────────────────────────────────────────────────

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
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
  };
}

// ─── List my bookings ─────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(['Pending', 'To Pay', 'Confirmed', 'Completed', 'Rejected']);

async function listBookings(customerId, rawStatus) {
  const status = rawStatus ? String(rawStatus).trim() : null;
  if (status && !VALID_STATUSES.has(status)) throw new AppError('Invalid status filter.', 400);

  const rows = await customerDashboardModel.findByCustomer(customerId, status);
  return rows.map(toBookingEntry);
}

// ─── Booking details ──────────────────────────────────────────────────────────

async function getBookingDetails(customerId, rawId) {
  const id = parseBookingId(rawId);
  const booking = await customerDashboardModel.findOneByCustomer(customerId, id);
  if (!booking) throw new AppError('Booking not found.', 404);

  const [services, payments] = await Promise.all([
    customerDashboardModel.findServicesByBooking(id),
    paymentModel.findByBooking(id),
  ]);

  const totalCents = toCents(booking.totalAmount);
  const paidCents = toCents(booking.amountPaid);
  const downpaymentCents = requiredDownpaymentCents(totalCents);

  return {
    id: booking.id,
    reference: booking.reference,
    eventDate: booking.eventDate,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
    subtotal: fromCents(toCents(booking.subtotal)),
    discountAmount: fromCents(toCents(booking.discountAmount || 0)),
    totalAmount: fromCents(totalCents),
    amountPaid: fromCents(paidCents),
    balance: fromCents(totalCents - paidCents),
    requiredDownpayment: fromCents(downpaymentCents),
    downpaymentPaid: paidCents >= downpaymentCents,
    voucherCode: booking.voucherCode || null,
    services: services.map((s) => ({ id: s.id, name: s.name, price: fromCents(toCents(s.price)) })),
    payments: payments.map((p) => ({
      id: p.id,
      type: p.type,
      amount: fromCents(toCents(p.amount)),
      method: p.method,
      status: p.status,
      rejectReason: p.rejectReason,
      submittedAt: p.submittedAt,
      reviewedAt: p.reviewedAt,
    })),
  };
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

    const [[voucher]] = await connection.query(
      `SELECT voucher_id AS id, discount_type AS discountType, discount_value AS discountValue
         FROM voucher
        WHERE voucher_code = ?
          AND CURDATE() BETWEEN start_date AND end_date
          AND usage_limit > (SELECT COUNT(*) FROM booking b2 WHERE b2.voucher_code = voucher.voucher_code)`,
      [code]
    );

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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

async function requestReschedule(customerId, rawBookingId, body) {
  const bookingId = parseBookingId(rawBookingId);
  const newDate = String(body?.newDate ?? '').trim();
  const newStartTime = String(body?.newStartTime ?? '').trim();
  const newEndTime = String(body?.newEndTime ?? '').trim();

  const errors = {};
  if (!isValidIsoDate(newDate)) errors.newDate = 'Choose a valid date.';
  else if (newDate < todayIso()) errors.newDate = 'Choose today or a future date.';
  if (!TIME_PATTERN.test(newStartTime)) errors.newStartTime = 'Choose a start time.';
  if (!TIME_PATTERN.test(newEndTime)) errors.newEndTime = 'Choose an end time.';

  if (!errors.newStartTime && !errors.newEndTime) {
    const opens = timeTextToMinutes(BOOKING_HOURS.open);
    const closes = timeTextToMinutes(BOOKING_HOURS.close);
    const start = timeTextToMinutes(newStartTime);
    const end = timeTextToMinutes(newEndTime);

    if (end <= start) errors.newEndTime = 'End time must be later than start time.';
    else if (start < opens || end > closes) {
      errors.newStartTime = `Bookings are accepted from ${BOOKING_HOURS.open} to ${BOOKING_HOURS.close} only.`;
    }
  }

  if (Object.keys(errors).length > 0) throw new AppError('Please fix the highlighted fields.', 400, errors);

  return withTransaction(async (connection) => {
    const booking = await bookingManagementModel.lockById(connection, bookingId);

    if (!booking || booking.customerId !== customerId) throw new AppError('Booking not found.', 404);

    if (!['To Pay', 'Confirmed'].includes(booking.status)) {
      throw new AppError('Only confirmed or awaiting-payment bookings can be rescheduled.', 409);
    }

    // Check if any selected service is Modeling Workshop
    const serviceIds = await bookingManagementModel.findServiceIds(connection, bookingId);
    const [[{ n }]] = await connection.query(
      `SELECT COUNT(*) AS n
         FROM service
        WHERE service_id IN (?)
          AND LOWER(service_name) LIKE '%modeling workshop%'`,
      [serviceIds]
    );

    if (n > 0) {
      throw new AppError(
        'Modeling Workshop can only be rescheduled by the studio owner.',
        409,
        { newDate: 'Modeling Workshop can only be rescheduled by the studio owner.' }
      );
    }

    // Check availability
    if (await blockedDateModel.exists(newDate)) {
      throw new AppError('This date is not available. Please choose another.', 409, {
        newDate: 'This date is not available. Please choose another.',
      });
    }

    const conflict = await bookingManagementModel.findConflict(connection, {
      bookingId,
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      serviceIds,
      statuses: SCHEDULE_CONFLICT_STATUSES,
    });

    if (conflict) {
      throw new AppError('This schedule is not available. Please choose another.', 409, {
        newDate: 'This date or time is not available. Please choose another.',
      });
    }

    // Store the reschedule request in a dedicated table
    const [[existing]] = await connection.query(
      "SELECT request_id FROM reschedule_request WHERE booking_id = ? AND status = 'Pending'",
      [bookingId]
    );

    if (existing) {
      await connection.query(
        `UPDATE reschedule_request
            SET new_date = ?, new_start_time = ?, new_end_time = ?
          WHERE request_id = ?`,
        [newDate, `${newStartTime}:00`, `${newEndTime}:00`, existing.request_id]
      );
    } else {
         await connection.query(
        `INSERT INTO reschedule_request
           (booking_id, old_date, old_start_time, old_end_time, new_date, new_start_time, new_end_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          bookingId,
          booking.eventDate,
          `${booking.startTime}:00`,
          `${booking.endTime}:00`,
          newDate,
          `${newStartTime}:00`,
          `${newEndTime}:00`,
        ]
      );
    }

    return { bookingId, newDate, newStartTime, newEndTime, rescheduleStatus: 'Pending' };
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
  submitPayment,
  applyVoucher,
  requestReschedule,
  updateProfile,
  changePassword,
  getProfile,
};
