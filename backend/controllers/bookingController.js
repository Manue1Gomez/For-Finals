const bookingService = require('../services/bookingManagementService');
const sendError = require('./errorResponse');

async function list(req, res, next) {
  try {
    res.json(await bookingService.listBookings(req.query));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function details(req, res, next) {
  try {
    res.json(await bookingService.getBookingDetails(req.params.id));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function acceptanceConflicts(req, res, next) {
  try {
    res.json(await bookingService.getAcceptanceConflicts(req.params.id));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    res.json(await bookingService.updateBooking(req.params.id, req.body));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function availability(req, res, next) {
  try {
    res.json(await bookingService.getBookingAvailability(req.params.id, req.query.date));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await bookingService.deleteBooking(req.params.id);
    res.status(204).end();
  } catch (error) {
    sendError(error, res, next);
  }
}

async function autoComplete(req, res, next) {
  try {
    const result = await bookingService.autoCompleteBookings();
    res.json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { list, details, acceptanceConflicts, update, availability, remove, autoComplete };
