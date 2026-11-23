const customerBookingService = require('../services/customerBookingService');
const sendError = require('./errorResponse');

async function create(req, res, next) {
  try {
    const booking = await customerBookingService.createBooking(req.session.customer.id, req.body);
    res.status(201).json(booking);
  } catch (error) {
    sendError(error, res, next);
  }
}

async function validateVoucher(req, res, next) {
  try {
    const result = await customerBookingService.validateVoucher(
      req.body?.voucherCode,
      req.body?.subtotal
    );
    res.json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { create, validateVoucher };
