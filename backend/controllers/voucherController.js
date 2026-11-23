const voucherService = require('../services/voucherManagementService');
const sendError = require('./errorResponse');

async function list(req, res, next) {
  try {
    res.json(await voucherService.listVouchers());
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    res.status(201).json(await voucherService.createVoucher(req.body));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    res.json(await voucherService.updateVoucher(req.params.id, req.body));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await voucherService.deleteVoucher(req.params.id);
    res.status(204).end();
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { list, create, update, remove };
