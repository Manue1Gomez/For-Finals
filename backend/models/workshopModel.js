const { pool } = require('../config/db');
const { MODELING_WORKSHOP_PATTERN, ONGOING_WORKSHOP_STATUSES } = require('../config/workshopRules');
const { REFERENCE, CLIENT_NAME, START_MINUTES, END_MINUTES, SERVICES_SUBQUERY } = require('./bookingSql');

const INCLUDES_WORKSHOP = `EXISTS (
  SELECT 1
    FROM booking_service bs
    JOIN service s ON s.service_id = bs.service_id
   WHERE bs.booking_id = b.booking_id
     AND LOWER(s.service_name) LIKE ?
)`;

const SERVICE_COUNT = '(SELECT COUNT(*) FROM booking_service bs2 WHERE bs2.booking_id = b.booking_id)';

// One row per ongoing booking that includes the Modeling Workshop.
async function findOngoing() {
  const [rows] = await pool.query(
    `SELECT b.booking_id AS id,
            ${REFERENCE} AS reference,
            c.customer_id AS customerId,
            ${CLIENT_NAME} AS customerName,
            c.email AS customerEmail,
            c.contact_num AS customerContact,
            ${SERVICES_SUBQUERY} AS services,
            ${SERVICE_COUNT} AS serviceCount,
            DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
            ${START_MINUTES} AS startMinutes,
            ${END_MINUTES} AS endMinutes,
            b.status,
            b.total_amount AS totalAmount,
            b.amount_paid AS amountPaid
       FROM booking b
       JOIN customer c ON c.customer_id = b.customer_id
      WHERE b.status IN (?)
        AND ${INCLUDES_WORKSHOP}
      ORDER BY b.event_date ASC, b.start_time ASC`,
    [ONGOING_WORKSHOP_STATUSES, MODELING_WORKSHOP_PATTERN]
  );
  return rows;
}

// Used to decide whether the admin may reschedule this booking.
async function findStudentBooking(bookingId) {
  const [[row]] = await pool.query(
    `SELECT b.booking_id AS id,
            b.status,
            DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
            TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
            TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
            ${INCLUDES_WORKSHOP} AS includesWorkshop,
            ${SERVICE_COUNT} AS serviceCount
       FROM booking b
      WHERE b.booking_id = ?`,
    [MODELING_WORKSHOP_PATTERN, bookingId]
  );
  return row || null;
}

module.exports = { findOngoing, findStudentBooking };
