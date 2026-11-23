const AppError = require('./appError');
const { pool } = require('../config/db');
const { toCents, fromCents } = require('./money');
const { formatTimeRange, timeTextToMinutes } = require('./timeHelper');

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError('Booking not found.', 404);
  return id;
}

async function getContractData(rawId, requesterId, requesterRole) {
  const id = parseId(rawId);

  const [[booking]] = await pool.query(
    `SELECT b.booking_id        AS id,
            CONCAT(DATE_FORMAT(b.created_at, '%y'), LPAD(b.booking_id, 3, '0')) AS reference,
            b.event_date        AS eventDate,
            TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
            TIME_FORMAT(b.end_time,   '%H:%i') AS endTime,
            b.event_address     AS eventAddress,
            b.voucher_code      AS voucherCode,
            b.subtotal          AS subtotal,
            b.discount_amount   AS discountAmount,
            b.total_amount      AS totalAmount,
            b.amount_paid       AS amountPaid,
            b.status            AS status,
            DATE_FORMAT(b.created_at, '%Y-%m-%d') AS createdAt,
            b.customer_id       AS customerId,
            c.f_name            AS firstName,
            c.l_name            AS lastName,
            c.email             AS email,
            c.contact_num       AS contactNumber
       FROM booking b
       JOIN customer c ON c.customer_id = b.customer_id
      WHERE b.booking_id = ?`,
    [id]
  );

  if (!booking) throw new AppError('Booking not found.', 404);

  // Customers can only see their own contract; admins see all
  if (requesterRole === 'customer' && booking.customerId !== requesterId) {
    throw new AppError('Booking not found.', 404);
  }

  // Customers: contract available for Confirmed and Completed
  // Admin: contract available once booking is accepted (To Pay, Confirmed, Completed)
  const allowedForCustomer = ['Confirmed', 'Completed'];
  const allowedForAdmin    = ['To Pay', 'Confirmed', 'Completed'];
  const allowed = requesterRole === 'admin' ? allowedForAdmin : allowedForCustomer;

  if (!allowed.includes(booking.status)) {
    const msg = requesterRole === 'admin'
      ? 'The contract is only available for accepted bookings.'
      : 'The contract is available once your booking is confirmed.';
    throw new AppError(msg, 403);
  }

  const [services] = await pool.query(
    `SELECT s.service_name AS name, bs.price AS price
       FROM booking_service bs
       JOIN service s ON s.service_id = bs.service_id
      WHERE bs.booking_id = ?
      ORDER BY s.service_id`,
    [id]
  );

  const totalCents = toCents(booking.totalAmount);
  const paidCents  = toCents(booking.amountPaid);

  return {
    reference:     booking.reference,
    status:        booking.status,
    createdAt:     booking.createdAt,
    eventDate:     booking.eventDate,
    timeLabel:     formatTimeRange(timeTextToMinutes(booking.startTime), timeTextToMinutes(booking.endTime)),
    eventAddress:  booking.eventAddress || null,
    customer: {
      name:          `${booking.firstName} ${booking.lastName}`,
      email:         booking.email,
      contactNumber: booking.contactNumber,
    },
    services: services.map((s) => ({ name: s.name, price: fromCents(toCents(s.price)) })),
    subtotal:        fromCents(toCents(booking.subtotal)),
    discountAmount:  fromCents(toCents(booking.discountAmount || 0)),
    voucherCode:     booking.voucherCode || null,
    totalAmount:     fromCents(totalCents),
    amountPaid:      fromCents(paidCents),
    balance:         fromCents(totalCents - paidCents),
    requiredDownpayment: fromCents(Math.ceil(totalCents / 2)),
  };
}

module.exports = { getContractData };
