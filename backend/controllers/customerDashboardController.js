const customerDashboardService = require('../services/customerDashboardService');
const sendError = require('./errorResponse');

function customerId(req) {
  return req.session.customer.id;
}

async function listBookings(req, res, next) {
  try {
    const bookings = await customerDashboardService.listBookings(customerId(req), req.query.status);
    res.json({ bookings });
  } catch (error) {
    sendError(error, res, next);
  }
}

async function getBookingDetails(req, res, next) {
  try {
    const booking = await customerDashboardService.getBookingDetails(customerId(req), req.params.id);
    res.json({ booking });
  } catch (error) {
    sendError(error, res, next);
  }
}

async function submitPayment(req, res, next) {
  try {
    const result = await customerDashboardService.submitPayment(customerId(req), req.params.id, req.file);
    res.status(201).json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

async function startGCashPayment(req, res, next) {
  try {
    const result = await customerDashboardService.startGCashPayment(customerId(req), req.params.id);
    res.status(201).json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

async function applyVoucher(req, res, next) {
  try {
    const result = await customerDashboardService.applyVoucher(customerId(req), req.params.id, req.body?.voucherCode);
    res.json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

async function requestReschedule(req, res, next) {
  try {
    const result = await customerDashboardService.requestReschedule(customerId(req), req.params.id, req.body);
    res.json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

async function getProfile(req, res, next) {
  try {
    const profile = await customerDashboardService.getProfile(customerId(req));
    res.json({ profile });
  } catch (error) {
    sendError(error, res, next);
  }
}

async function updateProfile(req, res, next) {
  try {
    const profile = await customerDashboardService.updateProfile(customerId(req), req.body);
    res.json({ profile });
  } catch (error) {
    sendError(error, res, next);
  }
}

async function changePassword(req, res, next) {
  try {
    const result = await customerDashboardService.changePassword(customerId(req), req.body);
    res.json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = {
  listBookings,
  getBookingDetails,
  submitPayment,
  startGCashPayment,
  applyVoucher,
  requestReschedule,
  getProfile,
  updateProfile,
  changePassword,
};
