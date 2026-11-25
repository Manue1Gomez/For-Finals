const AppError = require('./appError');
const bookingManagementService = require('./bookingManagementService');
const workshopModel = require('../models/workshopModel');
const { splitServices } = require('../models/bookingSql');
const { ONGOING_WORKSHOP_STATUSES } = require('../config/workshopRules');
const { toCents, fromCents } = require('./money');
const { describePayment } = require('./paymentRules');
const { formatTimeRange, isValidIsoDate, todayIso } = require('./timeHelper');
const BUNDLED_MESSAGE = 'This booking includes other services, so it cannot be rescheduled from here.';

const asText = (value) => String(value ?? '').trim();

const toTimeText = (totalMinutes) =>
  `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;

function parseBookingId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError('Booking not found.', 404);
  return id;
}

function toStudentEntry(row) {
  const totalCents = toCents(row.totalAmount);
  const paidCents = toCents(row.amountPaid);
  const isWorkshopOnly = row.serviceCount === 1;

  return {
    bookingId: row.id,
    reference: row.reference,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerContact: row.customerContact,
    services: splitServices(row.services),
    eventDate: row.eventDate,
    startTime: toTimeText(row.startMinutes),
    endTime: toTimeText(row.endMinutes),
    timeLabel: formatTimeRange(row.startMinutes, row.endMinutes),
    status: row.status,
    totalAmount: fromCents(totalCents),
    amountPaid: fromCents(paidCents),
    paymentLabel: describePayment(totalCents, paidCents),
    // Only a booking whose single service is the workshop may be moved by the admin.
    canReschedule: isWorkshopOnly,
    rescheduleBlockedReason: isWorkshopOnly ? null : BUNDLED_MESSAGE,
  };
}

async function listStudents() {
  const rows = await workshopModel.findOngoing();
  return { students: rows.map(toStudentEntry) };
}

function readScheduleInput(body = {}) {
  const input = { eventDate: asText(body.eventDate) };
  const errors = {};

  if (!isValidIsoDate(input.eventDate)) errors.eventDate = 'Enter a valid date.';
  else if (input.eventDate < todayIso()) errors.eventDate = 'Choose today or a later date.';

  if (Object.keys(errors).length > 0) throw new AppError('Please fix the highlighted fields.', 400, errors);

  return input;
}

// Delegates to the Bookings update so conflict, blocked-date and past-date rules stay identical.
async function rescheduleStudent(rawId, body) {
  const bookingId = parseBookingId(rawId);
  const input = readScheduleInput(body);

  const booking = await workshopModel.findStudentBooking(bookingId);

  if (!booking || !booking.includesWorkshop) throw new AppError('Workshop booking not found.', 404);

  if (!ONGOING_WORKSHOP_STATUSES.includes(booking.status)) {
    throw new AppError('Only ongoing workshops can be rescheduled.', 409);
  }

  if (booking.serviceCount !== 1) throw new AppError(BUNDLED_MESSAGE, 409);

  if (input.eventDate === booking.eventDate) {
    throw new AppError('Choose a different date from the current schedule.', 400, {
      eventDate: 'Choose a different date from the current schedule.',
    });
  }

  const updated = await bookingManagementService.updateBooking(bookingId, input);

  return { bookingId, eventDate: updated.eventDate, timeLabel: updated.timeLabel };
}

module.exports = { listStudents, rescheduleStudent };
