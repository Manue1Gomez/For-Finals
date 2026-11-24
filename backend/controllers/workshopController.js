const workshopService = require('../services/workshopService');
const sendError = require('./errorResponse');

async function list(req, res, next) {
  try {
    res.json(await workshopService.listStudents());
  } catch (error) {
    next(error);
  }
}

async function reschedule(req, res, next) {
  try {
    res.json(await workshopService.rescheduleStudent(req.params.bookingId, req.body));
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { list, reschedule };
