const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { withTransaction } = require('../config/db');
const AppError = require('../services/appError');
const sendError = require('../controllers/errorResponse');
const { formatMinutes } = require('../services/timeHelper');

function toMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function fmt(minutes) {
  return formatMinutes(minutes);
}

// GET /api/admin/reschedule — list all pending reschedule requests
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT rr.request_id      AS id,
              rr.booking_id      AS bookingId,
              CONCAT(DATE_FORMAT(b.created_at,'%y'), LPAD(b.booking_id,3,'0')) AS reference,
              CONCAT(c.f_name,' ',c.l_name) AS customerName,
              GROUP_CONCAT(s.service_name ORDER BY s.service_id SEPARATOR ', ') AS services,
              DATE_FORMAT(rr.old_date,'%Y-%m-%d')       AS oldDate,
              TIME_TO_SEC(rr.old_start_time) DIV 60     AS oldStartMinutes,
              TIME_TO_SEC(rr.old_end_time)   DIV 60     AS oldEndMinutes,
              DATE_FORMAT(rr.new_date,'%Y-%m-%d')       AS newDate,
              TIME_TO_SEC(rr.new_start_time) DIV 60     AS newStartMinutes,
              TIME_TO_SEC(rr.new_end_time)   DIV 60     AS newEndMinutes,
              rr.status                                  AS status,
              DATE_FORMAT(rr.created_at,'%Y-%m-%d %H:%i:%s') AS requestedAt
         FROM reschedule_request rr
         JOIN booking b ON b.booking_id = rr.booking_id
         JOIN customer c ON c.customer_id = b.customer_id
         JOIN booking_service bs ON bs.booking_id = b.booking_id
         JOIN service s ON s.service_id = bs.service_id
        WHERE rr.status = 'Pending'
        GROUP BY rr.request_id
        ORDER BY rr.created_at ASC`
    );

    const requests = rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      reference: r.reference,
      customerName: r.customerName,
      services: r.services,
      oldDate: r.oldDate,
      oldTimeLabel: `${fmt(r.oldStartMinutes)} - ${fmt(r.oldEndMinutes)}`,
      newDate: r.newDate,
      newTimeLabel: `${fmt(r.newStartMinutes)} - ${fmt(r.newEndMinutes)}`,
      status: r.status,
      requestedAt: r.requestedAt,
    }));

    res.json({ requests });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/reschedule/:id/approve
router.post('/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new AppError('Request not found.', 404);

    await withTransaction(async (connection) => {
      const [[rr]] = await connection.query(
        'SELECT * FROM reschedule_request WHERE request_id = ? AND status = ? FOR UPDATE',
        [id, 'Pending']
      );
      if (!rr) throw new AppError('Request not found or already reviewed.', 404);

      // Update the booking schedule
      await connection.query(
        `UPDATE booking
            SET event_date = ?, start_time = ?, end_time = ?
          WHERE booking_id = ?`,
        [rr.new_date, rr.new_start_time, rr.new_end_time, rr.booking_id]
      );

      // Mark request as approved
      await connection.query(
        "UPDATE reschedule_request SET status = 'Approved', reviewed_at = NOW() WHERE request_id = ?",
        [id]
      );
    });

    res.json({ id, status: 'Approved' });
  } catch (error) {
    sendError(error, res, next);
  }
});

// POST /api/admin/reschedule/:id/reject
router.post('/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new AppError('Request not found.', 404);

    const [[rr]] = await pool.query(
      "SELECT request_id FROM reschedule_request WHERE request_id = ? AND status = 'Pending'",
      [id]
    );
    if (!rr) throw new AppError('Request not found or already reviewed.', 404);

    await pool.query(
      "UPDATE reschedule_request SET status = 'Rejected', reviewed_at = NOW() WHERE request_id = ?",
      [id]
    );

    res.json({ id, status: 'Rejected' });
  } catch (error) {
    sendError(error, res, next);
  }
});

module.exports = router;
