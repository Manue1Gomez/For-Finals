const contractService = require('../services/contractService');
const sendError = require('./errorResponse');

async function getContract(req, res, next) {
  try {
    const customer = req.session?.customer ?? null;

    // If a customer is logged in, scope the contract to their bookings only.
    // Admin pages are unprotected on the backend, so no customer session = admin access.
    const requesterId   = customer ? customer.id : null;
    const requesterRole = customer ? 'customer' : 'admin';

    const data = await contractService.getContractData(req.params.id, requesterId, requesterRole);
    res.json(data);
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { getContract };
