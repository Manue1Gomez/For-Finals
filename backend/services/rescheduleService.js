const AppError = require('./appError');
const { withTransaction } = require('../config/db');
const { RESCHEDULE_STATUS } = require('../config/bookingStatus');
const { RESCHEDULABLE_STATUSES, SCHEDULE_CONFLICT_STATUSES } = require('../config/bookingRules');
const blockedDateModel = require('../models/blockedDateModel');
const bookingManagementModel = require('../models/bookingManagementModel');
const rescheduleModel = require('../models/rescheduleModel');
const { splitServices } = require('../models/bookingSql');
const { formatTimeRange } = require('./timeHelper');

const NOT_FOUND_MESSAGE = 'Request not found or already reviewed.';

function parseRequestId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError(NOT_FOUND_MESSAGE, 404);
  return id;
}

function toRequestEntry(row) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    reference: row.reference,
    customerName: row.customerName,
    services: splitServices(row.services),
    oldDate: row.oldDate,
    oldTimeLabel: formatTimeRange(row.oldStartMinutes, row.oldEndMinutes),
    newDate: row.newDate,
    newTimeLabel: formatTimeRange(row.newStartMinutes, row.newEndMinutes),
    requestedAt: row.requestedAt,
  };
}

async function listRequests() {
  const rows = await rescheduleModel.findPending();
  return { requests: rows.map(toRequestEntry) };
}

// Approving moves the booking to the requested schedule. The slot is checked again here
// because another booking may have taken it after the customer sent the request.
async function approveRequest(rawId) {
  const id = parseRequestId(rawId);

  await withTransaction(async (connection) => {
    const request = await rescheduleModel.lockPendingById(connection, id);
    if (!request) throw new AppError(NOT_FOUND_MESSAGE, 404);

    const booking = await bookingManagementModel.lockById(connection, request.bookingId);
    if (!booking) throw new AppError('The booking for this request no longer exists.', 404);

    if (!RESCHEDULABLE_STATUSES.includes(booking.status)) {
      throw new AppError(`This booking is now ${booking.status} and can no longer be rescheduled. Reject the request instead.`, 409);
    }

    if (await blockedDateModel.exists(request.newDate)) {
      throw new AppError('The requested date is now marked unavailable. Reject the request or ask the customer to pick another date.', 409);
    }

    const serviceIds = await bookingManagementModel.findServiceIds(connection, booking.id);
    const conflict = await bookingManagementModel.findConflict(connection, {
      bookingId: booking.id,
      date: request.newDate,
      startTime: request.newStartTime,
      endTime: request.newEndTime,
      serviceIds,
      statuses: SCHEDULE_CONFLICT_STATUSES,
    });

    if (conflict) {
      throw new AppError(`The requested schedule now conflicts with booking #${conflict.reference} (${conflict.serviceName}). Reject the request instead.`, 409);
    }

    await bookingManagementModel.setSchedule(connection, booking.id, {
      eventDate: request.newDate,
      startTime: request.newStartTime,
      endTime: request.newEndTime,
    });
    await rescheduleModel.markReviewed(connection, id, RESCHEDULE_STATUS.APPROVED);
  });

  return { id, status: RESCHEDULE_STATUS.APPROVED };
}

async function rejectRequest(rawId) {
  const id = parseRequestId(rawId);

  await withTransaction(async (connection) => {
    const request = await rescheduleModel.lockPendingById(connection, id);
    if (!request) throw new AppError(NOT_FOUND_MESSAGE, 404);

    await rescheduleModel.markReviewed(connection, id, RESCHEDULE_STATUS.REJECTED);
  });

  return { id, status: RESCHEDULE_STATUS.REJECTED };
}

module.exports = { listRequests, approveRequest, rejectRequest };
