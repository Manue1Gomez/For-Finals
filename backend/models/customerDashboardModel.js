const { pool } = require('../config/db');
const {
  REFERENCE,
  START_MINUTES,
  END_MINUTES,
  SERVICES_SUBQUERY,
} = require('./bookingSql');

// Gets the image_path of the first service on the booking (by service_id order)
const FIRST_IMAGE_SUBQUERY = `(
  SELECT s2.image_path
    FROM booking_service bs2
    JOIN service s2 ON s2.service_id = bs2.service_id
   WHERE bs2.booking_id = b.booking_id
   ORDER BY s2.service_id
   LIMIT 1
)`;

async function findByCustomer(customerId) {
  const [rows] = await pool.query(
    `SELECT b.booking_id AS id,
            ${REFERENCE} AS reference,
            ${SERVICES_SUBQUERY} AS services,
            ${FIRST_IMAGE_SUBQUERY} AS imageUrl,
            DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
            ${START_MINUTES} AS startMinutes,
            ${END_MINUTES} AS endMinutes,
            b.status AS status,
            b.subtotal AS subtotal,
            b.discount_amount AS discountAmount,
            b.total_amount AS totalAmount,
            b.amount_paid AS amountPaid,
            b.voucher_code AS voucherCode,
            EXISTS (
              SELECT 1
                FROM payment p_status
               WHERE p_status.booking_id = b.booking_id
                 AND p_status.status = 'Pending'
            ) AS hasPendingPayment
       FROM booking b
       JOIN customer c ON c.customer_id = b.customer_id
      WHERE b.customer_id = ?
       ORDER BY b.created_at DESC, b.booking_id DESC`,
    [customerId]
  );
  return rows;
}

async function findOneByCustomer(customerId, bookingId) {
  const [[row]] = await pool.query(
    `SELECT b.booking_id AS id,
            ${REFERENCE} AS reference,
            DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
            TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
            TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
            b.status AS status,
            b.subtotal AS subtotal,
            b.discount_amount AS discountAmount,
            b.total_amount AS totalAmount,
            b.amount_paid AS amountPaid,
            b.voucher_code AS voucherCode
       FROM booking b
      WHERE b.booking_id = ? AND b.customer_id = ?`,
    [bookingId, customerId]
  );
  return row || null;
}

async function findServicesByBooking(bookingId) {
  const [rows] = await pool.query(
    `SELECT s.service_id AS id,
            s.service_name AS name,
            bs.price AS price,
            s.duration_hours AS durationHours
       FROM booking_service bs
       JOIN service s ON s.service_id = bs.service_id
      WHERE bs.booking_id = ?
      ORDER BY s.service_id`,
    [bookingId]
  );
  return rows;
}

async function findReschedulable(customerId, bookingId) {
  // Returns the booking only when it belongs to the customer and is reschedulable
  const [[row]] = await pool.query(
    `SELECT b.booking_id AS id, b.status AS status
       FROM booking b
      WHERE b.booking_id = ?
        AND b.customer_id = ?
        AND b.status IN ('To Pay', 'Confirmed')`,
    [bookingId, customerId]
  );
  return row || null;
}

async function hasModelingWorkshop(bookingId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM booking_service bs
       JOIN service s ON s.service_id = bs.service_id
      WHERE bs.booking_id = ?
        AND LOWER(s.service_name) LIKE '%modeling workshop%'`,
    [bookingId]
  );
  return row.n > 0;
}

module.exports = {
  findByCustomer,
  findOneByCustomer,
  findServicesByBooking,
  findReschedulable,
  hasModelingWorkshop,
};
