const { GROUP_BY_STATUS } = require('./bookingRules');

// Matches the service by name, the same way the customer reschedule rule does.
const MODELING_WORKSHOP_PATTERN = '%modeling workshop%';

// A workshop is "ongoing" while its booking sits in the ongoing group (Confirmed).
// Once the booking is Completed the student only appears under Clients.
const ONGOING_WORKSHOP_STATUSES = Object.entries(GROUP_BY_STATUS)
  .filter(([, group]) => group === 'ongoing')
  .map(([status]) => status);

module.exports = { MODELING_WORKSHOP_PATTERN, ONGOING_WORKSHOP_STATUSES };
