const AppError = require('./appError');
const clientModel = require('../models/clientModel');
const { splitServices } = require('../models/bookingSql');
const { GROUP_BY_STATUS } = require('../config/bookingRules');
const { toCents, fromCents } = require('./money');
const { formatTimeRange } = require('./timeHelper');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;

const asText = (value) => String(value ?? '').trim();

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function readListQuery(query) {
  const sort = asText(query.sort) || clientModel.DEFAULT_SORT;

  if (!(sort in clientModel.SORT_ORDERS)) {
    throw new AppError('Unknown sort option.', 400, { sort: 'Unknown sort option.' });
  }

  return {
    search: asText(query.search).slice(0, MAX_SEARCH_LENGTH),
    sort,
    page: parsePositiveInteger(query.page, 1),
    pageSize: Math.min(parsePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
  };
}

function toFullName(row) {
  return `${row.firstName} ${row.lastName}`;
}

function toClientEntry(row) {
  return {
    id: row.id,
    name: toFullName(row),
    email: row.email,
    contactNumber: row.contactNumber,
    totalBookings: row.totalBookings,
    completedBookings: row.completedBookings,
    totalPaid: fromCents(toCents(row.totalPaid)),
    lastBookingDate: row.lastBookingDate,
    hasOngoingWorkshop: Boolean(row.hasOngoingWorkshop),
  };
}

function toBookingEntry(row) {
  return {
    id: row.id,
    reference: row.reference,
    services: splitServices(row.services),
    eventDate: row.eventDate,
    timeLabel: formatTimeRange(row.startMinutes, row.endMinutes),
    status: row.status,
    group: GROUP_BY_STATUS[row.status],
    totalAmount: fromCents(toCents(row.totalAmount)),
    amountPaid: fromCents(toCents(row.amountPaid)),
  };
}

async function listClients(query = {}) {
  const { search, sort, page, pageSize } = readListQuery(query);

  const [rows, total, summary] = await Promise.all([
    clientModel.findPage({ search, sort, limit: pageSize, offset: (page - 1) * pageSize }),
    clientModel.countMatching(search),
    clientModel.findSummary(),
  ]);

  return {
    clients: rows.map(toClientEntry),
    page,
    pageSize,
    total,
    summary: {
      totalClients: summary.totalClients,
      repeatClients: Number(summary.repeatClients),
      activeClients: Number(summary.activeClients),
    },
  };
}

async function getClient(rawId) {
  const id = Number(rawId);
  const client = Number.isInteger(id) && id > 0 ? await clientModel.findById(id) : null;

  if (!client) throw new AppError('Client not found.', 404);

  const bookings = (await clientModel.findBookingsByCustomer(id)).map(toBookingEntry);
  const countedBookings = bookings.filter((booking) => booking.status !== 'Rejected');

  return {
    client: {
      id: client.id,
      name: toFullName(client),
      email: client.email,
      contactNumber: client.contactNumber,
    },
    stats: {
      totalBookings: countedBookings.length,
      completedBookings: bookings.filter((booking) => booking.status === 'Completed').length,
      totalPaid: fromCents(countedBookings.reduce((sum, booking) => sum + toCents(booking.amountPaid), 0)),
    },
    bookings,
  };
}

async function getClientByEmail(rawEmail) {
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!email) throw new AppError('Enter an email address.', 400);

  const clientModel2 = require('../models/customerModel');
  const row = await clientModel2.findByEmail(email);
  if (!row) throw new AppError('No account found with that email address.', 404);

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    contactNumber: row.contactNumber,
  };
}

module.exports = { listClients, getClient, getClientByEmail };
