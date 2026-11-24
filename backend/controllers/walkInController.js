const walkInService = require('../services/walkInService');
const sendError = require('./errorResponse');

async function create(req, res, next) {
  try {
    const result = await walkInService.createWalkInBooking(req.body);
    res.status(201).json(result);
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { create };
