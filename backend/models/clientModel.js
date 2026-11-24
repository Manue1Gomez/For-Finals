const { pool } = require('../config/db');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const { ONGOING_STATUSES } = require('../config/bookingRules');
const { MODELING_WORKSHOP_PATTERN, ONGOING_WORKSHOP_STATUSES } = require('../config/workshopRules');
const { REFERENCE, START_MINUTES, END_MINUTES, SERVICES_SUBQUERY } = require('./bookingSql');

// Whitelist: the sort key from the request never reaches the SQL text directly.
const SORT_ORDERS = {
  mostBookings: 'totalBookings DESC, totalPaid DESC, c.f_name ASC',
  highestPaid: 'totalPaid DESC, totalBookings DESC, c.f_name ASC',
  recentBooking: 'lastBookingDate IS NULL, lastBookingDate DESC, c.f_name ASC',
  name: 'c.f_name ASC, c.l_name ASC',
  newest: 'c.customer_id DESC',
};

const DEFAULT_SORT = 'mostBookings';

// Rejected bookings were never accepted, so they do not count toward a client's activity.
const COUNTED_BOOKING = `b.status <> '${BOOKING_STATUS.REJECTED}'`;

const HAS_ONGOING_WORKSHOP = `EXISTS (
  SELECT 1
    FROM booking wb
    JOIN booking_service wbs ON wbs.booking_id = wb.booking_id
    JOIN service ws ON ws.service_id = wbs.service_id
   WHERE wb.customer_id = c.customer_id
     AND wb.status IN (?)
     AND LOWER(ws.service_name) LIKE ?
)`;

function buildSearchClause(search) {
  if (!search) return { clause: '', params: [] };

  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;

  return {
    clause: `WHERE (CONCAT(c.f_name, ' ', c.l_name) LIKE ? OR c.email LIKE ? OR c.contact_num LIKE ?)`,
    params: [pattern, pattern, pattern],
  };
}

async function findPage({ search, sort, limit, offset }) {
  const { clause, params } = buildSearchClause(search);
  const orderBy = SORT_ORDERS[sort] ?? SORT_ORDERS[DEFAULT_SORT];

  const [rows] = await pool.query(
    `SELECT c.customer_id AS id,
            c.f_name AS firstName,
            c.l_name AS lastName,
            c.email,
            c.contact_num AS contactNumber,
            COUNT(CASE WHEN ${COUNTED_BOOKING} THEN b.booking_id END) AS totalBookings,
            COUNT(CASE WHEN b.status = ? THEN b.booking_id END) AS completedBookings,
            COALESCE(SUM(CASE WHEN ${COUNTED_BOOKING} THEN b.amount_paid END), 0) AS totalPaid,
            DATE_FORMAT(MAX(CASE WHEN ${COUNTED_BOOKING} THEN b.event_date END), '%Y-%m-%d') AS lastBookingDate,
            ${HAS_ONGOING_WORKSHOP} AS hasOngoingWorkshop
       FROM customer c
       LEFT JOIN booking b ON b.customer_id = c.customer_id
       ${clause}
      GROUP BY c.customer_id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    [BOOKING_STATUS.COMPLETED, ONGOING_WORKSHOP_STATUSES, MODELING_WORKSHOP_PATTERN, ...params, limit, offset]
  );
  return rows;
}

async function countMatching(search) {
  const { clause, params } = buildSearchClause(search);
  const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM customer c ${clause}`, params);
  return row.total;
}

// Totals for the summary cards. Always for every client, whatever the search box says.
async function findSummary() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS totalClients,
            COALESCE(SUM(activity.totalBookings >= 2), 0) AS repeatClients,
            COALESCE(SUM(activity.activeBookings > 0), 0) AS activeClients
       FROM customer c
       LEFT JOIN (
         SELECT b.customer_id,
                COUNT(*) AS totalBookings,
                COUNT(CASE WHEN b.status IN (?) THEN 1 END) AS activeBookings
           FROM booking b
          WHERE ${COUNTED_BOOKING}
          GROUP BY b.customer_id
       ) activity ON activity.customer_id = c.customer_id`,
    [ONGOING_STATUSES]
  );
  return row;
}

async function findById(id) {
  const [[row]] = await pool.query(
    `SELECT c.customer_id AS id,
            c.f_name AS firstName,
            c.l_name AS lastName,
            c.email,
            c.contact_num AS contactNumber
       FROM customer c
      WHERE c.customer_id = ?`,
    [id]
  );
  return row || null;
}

async function findBookingsByCustomer(customerId) {
  const [rows] = await pool.query(
    `SELECT b.booking_id AS id,
            ${REFERENCE} AS reference,
            ${SERVICES_SUBQUERY} AS services,
            DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
            ${START_MINUTES} AS startMinutes,
            ${END_MINUTES} AS endMinutes,
            b.status,
            b.total_amount AS totalAmount,
            b.amount_paid AS amountPaid
       FROM booking b
      WHERE b.customer_id = ?
      ORDER BY b.event_date DESC, b.start_time DESC`,
    [customerId]
  );
  return rows;
}

module.exports = {
  SORT_ORDERS,
  DEFAULT_SORT,
  findPage,
  countMatching,
  findSummary,
  findById,
  findBookingsByCustomer,
};
