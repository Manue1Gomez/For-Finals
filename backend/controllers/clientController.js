const clientService = require('../services/clientService');
const sendError = require('./errorResponse');

async function list(req, res, next) {
  try {
    res.json(await clientService.listClients(req.query));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function details(req, res, next) {
  try {
    res.json(await clientService.getClient(req.params.id));
  } catch (error) {
    sendError(error, res, next);
  }
}

async function findByEmail(req, res, next) {
  try {
    res.json(await clientService.getClientByEmail(req.query.email));
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { list, details, findByEmail };
