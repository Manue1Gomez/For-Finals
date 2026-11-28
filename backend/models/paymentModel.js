const { pool } = require('../config/db');
const { findMissingColumnProblems } = require('../config/schemaCheck');
const {
  REFERENCE,
  CLIENT_NAME,
  START_MINUTES,
  END_MINUTES,
  SERVICES_SUBQUERY,
  PENDING_PAYMENTS_SUBQUERY,
} = require('./bookingSql');

const REQUIRED_COLUMNS = [
  'payment_id',
  'booking_id',
  'payment_type',
  'amount',
  'method',
  'reference_number',
  'proof_path',
  'status',
  'reject_reason',
  'note',
  'recorded_by',
  'submitted_at',
  'reviewed_at',
  'receipt_sent_at',
];

const PAYMENT_FIELDS = `p.payment_id AS id,
                        p.booking_id AS bookingId,
                        p.payment_type AS type,
                        p.amount AS amount,
                        p.method AS method,
                        p.reference_number AS referenceNumber,
                        p.proof_path AS proofUrl,
                        p.status AS status,
                        p.reject_reason AS rejectReason,
                        p.note AS note,
                        p.recorded_by AS recordedBy,
                        DATE_FORMAT(p.submitted_at, '%Y-%m-%d %H:%i:%s') AS submittedAt,
                        DATE_FORMAT(p.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt`;

async function findPendingForReview() {
  const [rows] = await pool.query(
    `SELECT ${PAYMENT_FIELDS},
            ${REFERENCE} AS reference,
            ${CLIENT_NAME} AS customerName,
            c.email AS customerEmail,
            ${SERVICES_SUBQUERY} AS services,
            b.total_amount AS totalAmount,
            b.amount_paid AS amountPaid
       FROM payment p
       JOIN booking b ON b.booking_id = p.booking_id
       JOIN customer c ON c.customer_id = b.customer_id
       WHERE p.status = 'Pending'
         AND p.proof_path IS NOT NULL
      ORDER BY p.submitted_at, p.payment_id`
  );
  return rows;
}

async function findPendingForBooking(connection, bookingId) {
  const [[row]] = await connection.query(
    `SELECT payment_id AS id,
             payment_type AS type,
             amount,
             method,
             reference_number AS referenceNumber,
             proof_path AS proofUrl
        FROM payment
       WHERE booking_id = ? AND status = 'Pending'
       ORDER BY submitted_at, payment_id
       LIMIT 1
       FOR UPDATE`,
    [bookingId]
  );
  return row || null;
}

async function hasPendingPaymentForBooking(connection, bookingId) {
  const [[row]] = await connection.query(
    `SELECT EXISTS(
       SELECT 1 FROM payment
        WHERE booking_id = ? AND status = 'Pending'
          AND proof_path IS NOT NULL
     ) AS hasPendingPayment`,
    [bookingId]
  );
  return Number(row.hasPendingPayment) === 1;
}

async function hasActivePaymentForBooking(connection, bookingId) {
  const [[row]] = await connection.query(
    `SELECT EXISTS(
       SELECT 1 FROM payment
        WHERE booking_id = ? AND status IN ('Pending', 'Verified')
     ) AS hasActivePayment`,
    [bookingId]
  );
  return Number(row.hasActivePayment) === 1;
}

async function createPendingGatewayPayment(connection, { bookingId, type, amount, idempotencyKey }) {
  const [result] = await connection.query(
    `INSERT INTO payment (booking_id, payment_type, amount, method, reference_number, status, submitted_at)
     VALUES (?, ?, ?, 'GCash', ?, 'Pending', NOW())`,
    [bookingId, type, amount, idempotencyKey]
  );
  return result.insertId;
}

async function updateGatewayReference(connection, id, idempotencyKey, providerPaymentId) {
  const [result] = await connection.query(
    `UPDATE payment
         SET reference_number = ?
       WHERE payment_id = ?
         AND status = 'Pending'
         AND reference_number = ?`,
    [providerPaymentId, id, idempotencyKey]
  );
  return result.affectedRows > 0;
}

async function attachProof(connection, id, proofPath) {
  const [result] = await connection.query(
    `UPDATE payment
        SET proof_path = ?
      WHERE payment_id = ?
        AND status = 'Pending'
        AND proof_path IS NULL`,
    [proofPath, id]
  );
  return result.affectedRows > 0;
}

async function findGatewayByReference(connection, providerPaymentId, idempotencyKey) {
  const [[row]] = await connection.query(
    `SELECT ${PAYMENT_FIELDS}
        FROM payment p
       WHERE p.reference_number IN (?, ?)
         AND p.method = 'GCash'
       ORDER BY (p.reference_number = ?) DESC
       LIMIT 1
      `,
    [providerPaymentId, idempotencyKey || providerPaymentId, providerPaymentId]
  );
  return row || null;
}

async function markGatewayRejected(connection, id, providerPaymentId, reason) {
  await connection.query(
    `UPDATE payment
         SET status = 'Rejected', reference_number = ?, reject_reason = ?, reviewed_at = NOW()
       WHERE payment_id = ? AND status = 'Pending'`,
    [providerPaymentId, reason, id]
  );
}

async function findOutstandingBookings(statuses) {
  const [rows] = await pool.query(
    `SELECT b.booking_id AS id,
            ${REFERENCE} AS reference,
            ${CLIENT_NAME} AS customerName,
            ${SERVICES_SUBQUERY} AS services,
            DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
            ${START_MINUTES} AS startMinutes,
            ${END_MINUTES} AS endMinutes,
            b.status AS status,
            b.total_amount AS totalAmount,
            b.amount_paid AS amountPaid,
            ${PENDING_PAYMENTS_SUBQUERY} AS pendingPayments
       FROM booking b
       JOIN customer c ON c.customer_id = b.customer_id
      WHERE b.status IN (?)
        AND b.total_amount > b.amount_paid
      ORDER BY b.event_date, b.start_time, b.booking_id`,
    [statuses]
  );
  return rows;
}

async function findBookingId(connection, id) {
  const [[row]] = await connection.query('SELECT booking_id AS bookingId FROM payment WHERE payment_id = ?', [id]);
  return row ? row.bookingId : null;
}

async function findForUpdate(connection, id) {
  const [[row]] = await connection.query(
    `SELECT ${PAYMENT_FIELDS} FROM payment p WHERE p.payment_id = ? FOR UPDATE`,
    [id]
  );
  return row || null;
}

async function findById(id) {
  const [[row]] = await pool.query(`SELECT ${PAYMENT_FIELDS} FROM payment p WHERE p.payment_id = ?`, [id]);
  return row || null;
}

async function findByBooking(bookingId) {
  const [rows] = await pool.query(
    `SELECT ${PAYMENT_FIELDS} FROM payment p WHERE p.booking_id = ? ORDER BY p.submitted_at, p.payment_id`,
    [bookingId]
  );
  return rows;
}

async function insertVerifiedByAdmin(connection, { bookingId, type, amount, method, note }) {
  const [result] = await connection.query(
    `INSERT INTO payment (booking_id, payment_type, amount, method, note, status, recorded_by, reviewed_at)
     VALUES (?, ?, ?, ?, ?, 'Verified', 'Admin', NOW())`,
    [bookingId, type, amount, method, note]
  );
  return result.insertId;
}

async function markVerified(connection, id) {
  await connection.query("UPDATE payment SET status = 'Verified', reviewed_at = NOW() WHERE payment_id = ?", [id]);
}

async function markRejected(connection, id, reason) {
  await connection.query(
    "UPDATE payment SET status = 'Rejected', reject_reason = ?, reviewed_at = NOW() WHERE payment_id = ?",
    [reason, id]
  );
}

async function markReceiptSent(id) {
  await pool.query('UPDATE payment SET receipt_sent_at = NOW() WHERE payment_id = ?', [id]);
}

async function verifySchema() {
  const { problems } = await findMissingColumnProblems('payment', REQUIRED_COLUMNS);

  if (problems.length > 0) problems.push('Run database/payment_table.sql in phpMyAdmin to fix this.');
  return problems;
}

module.exports = {
  findPendingForReview,
  findPendingForBooking,
  hasPendingPaymentForBooking,
  hasActivePaymentForBooking,
  createPendingGatewayPayment,
  updateGatewayReference,
  attachProof,
  findGatewayByReference,
  markGatewayRejected,
  findOutstandingBookings,
  findBookingId,
  findForUpdate,
  findById,
  findByBooking,
  insertVerifiedByAdmin,
  markVerified,
  markRejected,
  markReceiptSent,
  verifySchema,
};
