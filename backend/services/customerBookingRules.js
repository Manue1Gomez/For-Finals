const { BOOKING_STATUS } = require('../config/bookingStatus');
const { CUSTOMER_BOOKING_STATUS } = require('./paymentRules');

const CUSTOMER_MINIMUM_NOTICE_DAYS = 2;
const CANCELLABLE_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.TO_PAY];
const RESCHEDULABLE_CUSTOMER_STATUSES = [
  CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION,
  BOOKING_STATUS.CONFIRMED,
];

function isoDateNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date.getTime() / 86_400_000;
}

function hasMinimumCustomerNotice(eventDate, today) {
  const eventDay = isoDateNumber(eventDate);
  const todayDay = isoDateNumber(today);
  return eventDay !== null
    && todayDay !== null
    && eventDay - todayDay >= CUSTOMER_MINIMUM_NOTICE_DAYS;
}

function isCustomerBookingDateAllowed(eventDate, today) {
  return hasMinimumCustomerNotice(eventDate, today);
}

function isWithinCustomerRescheduleWindow(eventDate, today) {
  return hasMinimumCustomerNotice(eventDate, today);
}

function canCustomerCancel(status) {
  return CANCELLABLE_STATUSES.includes(status);
}

function canCustomerReschedule(status, eventDate, today) {
  return RESCHEDULABLE_CUSTOMER_STATUSES.includes(status)
    && isWithinCustomerRescheduleWindow(eventDate, today);
}

module.exports = {
  canCustomerCancel,
  canCustomerReschedule,
  isCustomerBookingDateAllowed,
  isWithinCustomerRescheduleWindow,
};
