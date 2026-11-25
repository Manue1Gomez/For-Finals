import { getJson, sendJson, deleteRequest } from './admin-api.js';
import { formatDate, formatDateTime, formatLongDate, formatPeso, statusSlug } from './format.js';
import { clearFieldOnInput, enableDialogDismiss, showToast } from './ui.js';

const API_BASE = '/api/admin/bookings';
const SERVICES_API = '/api/admin/services';
const SEARCH_DELAY_MS = 300;
const CONTRACT_PAGE = '/customer/html/contract.html';


const GROUP_LABELS = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
  rejected: 'Rejected',
};

const elements = {
  searchInput: document.getElementById('searchInput'),
  serviceFilter: document.getElementById('serviceFilter'),
  dateFilter: document.getElementById('dateFilter'),
  clearFilters: document.getElementById('clearFilters'),
  statusTabs: document.getElementById('statusTabs'),
  bookingWrap: document.getElementById('bookingWrap'),
  bookingBody: document.getElementById('bookingBody'),
  bookingStatus: document.getElementById('bookingStatus'),
  rowTemplate: document.getElementById('bookingRowTemplate'),
  groupTemplate: document.getElementById('groupRowTemplate'),
  pagination: document.getElementById('pagination'),
  pageSummary: document.getElementById('pageSummary'),
  previousPage: document.getElementById('previousPage'),
  nextPage: document.getElementById('nextPage'),

  viewDialog: document.getElementById('viewDialog'),
  viewReference: document.getElementById('viewReference'),
  viewTitle: document.getElementById('viewTitle'),
  viewStatus: document.getElementById('viewStatus'),
  viewCustomer: document.getElementById('viewCustomer'),
  viewSchedule: document.getElementById('viewSchedule'),
  viewServices: document.getElementById('viewServices'),
  viewTotals: document.getElementById('viewTotals'),
  viewPayments: document.getElementById('viewPayments'),
  viewNoPayments: document.getElementById('viewNoPayments'),
  viewContract: document.getElementById('viewContractButton'),
  editSchedule: document.getElementById('editScheduleButton'),

  scheduleDialog: document.getElementById('scheduleDialog'),
  scheduleForm: document.getElementById('scheduleForm'),
  scheduleDate: document.getElementById('scheduleDate'),
  scheduleSlotStatus: document.getElementById('scheduleSlotStatus'),
  scheduleSlots: document.getElementById('scheduleSlots'),
  scheduleError: document.getElementById('scheduleError'),
  scheduleSave: document.getElementById('scheduleSave'),

  confirmDialog: document.getElementById('confirmDialog'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmError: document.getElementById('confirmError'),
  confirmButton: document.getElementById('confirmButton'),
};

const state = {
  search: '',
  serviceId: '',
  date: '',
  status: 'Pending',
  page: 1,
  pageSize: 10,
  data: null,
};

let latestRequest = 0;
let searchTimer = null;
let pendingConfirm = null;
let viewing = null;
let scheduleSlots = [];
let selectedScheduleSlot = null;
let scheduleAvailabilityRequest = 0;
let editingSchedule = null;

const hasActiveFilters = () => Boolean(state.search || state.serviceId || state.date);

function buildQuery() {
  const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });

  params.set('status', state.status);
  if (state.search) params.set('search', state.search);
  if (state.serviceId) params.set('serviceId', state.serviceId);
  if (state.date) params.set('date', state.date);

  return params.toString();
}

function createGroupRow(group, counts) {
  const row = elements.groupTemplate.content.firstElementChild.cloneNode(true);
  const total = counts[state.status];

  row.querySelector('.group-row__label').textContent = GROUP_LABELS[group];
  row.querySelector('.group-row__count').textContent = total;

  return row;
}

function createBookingRow(booking) {
  const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
  const pill = row.querySelector('.pill');
  const percent = booking.totalAmount > 0 ? Math.round((booking.amountPaid / booking.totalAmount) * 100) : 0;
  const reviewLink = row.querySelector('.bookings-table__review-link');
  const label = `#${booking.reference}`;

  row.dataset.id = booking.id;
  row.classList.toggle('data-row--pending', booking.status === 'Pending');

  row.querySelector('.bookings-table__name').textContent = booking.customerName;
  row.querySelector('.bookings-table__reference').textContent = label;
  row.querySelector('.bookings-table__services').replaceChildren(
    ...booking.services.map((service) => {
      const line = document.createElement('span');
      line.className = 'bookings-table__service';
      line.textContent = service;
      return line;
    })
  );
  row.querySelector('.bookings-table__date').textContent = formatDate(booking.eventDate);
  row.querySelector('.bookings-table__time').textContent = booking.timeLabel;
  row.querySelector('.bookings-table__amounts').textContent =
    `${formatPeso(booking.amountPaid)} / ${formatPeso(booking.totalAmount)}`;
  row.querySelector('.progress__bar').style.setProperty('--percent', `${percent}%`);
  row.querySelector('.bookings-table__payment-label').textContent = booking.paymentLabel;
  reviewLink.hidden = booking.pendingPayments === 0;

  pill.textContent = booking.status;
  pill.classList.add(`pill--${statusSlug(booking.status)}`);
  row.querySelector('.quick-actions').hidden = booking.status !== 'Pending';

  row.querySelector('[data-action="view"]').setAttribute('aria-label', `View booking ${label}`);
  row.querySelector('[data-action="contract"]').setAttribute('aria-label', `Contract for booking ${label}`);
  row.querySelector('[data-action="delete"]').setAttribute('aria-label', `Delete booking ${label}`);

  return row;
}

function renderTabs(counts) {
  elements.statusTabs.querySelectorAll('.status-tab').forEach((tab) => {
    const status = tab.dataset.status;
    const isActive = status === state.status;

    tab.classList.toggle('status-tab--active', isActive);
    tab.classList.toggle('status-tab--attention', status === 'Pending' && counts.Pending > 0);
    tab.setAttribute('aria-pressed', String(isActive));
    tab.querySelector('.status-tab__count').textContent = counts[status] ?? 0;
  });
}

function renderTable() {
  const { bookings, counts, total, page, pageSize } = state.data;
  const rows = [];
  let lastGroup = null;

  bookings.forEach((booking) => {
    if (booking.group !== lastGroup) {
      rows.push(createGroupRow(booking.group, counts));
      lastGroup = booking.group;
    }
    rows.push(createBookingRow(booking));
  });

  elements.bookingBody.replaceChildren(...rows);
  elements.bookingWrap.hidden = bookings.length === 0;
  elements.bookingStatus.hidden = bookings.length > 0;
  elements.pagination.hidden = bookings.length === 0;

  if (bookings.length === 0) {
    elements.bookingStatus.textContent = hasActiveFilters()
      ? 'No bookings match your search or filters.'
      : `There are no ${state.status.toLowerCase()} bookings yet.`;
  }

  const first = (page - 1) * pageSize + 1;
  const last = first + bookings.length - 1;

  elements.pageSummary.textContent = `Showing ${first}\u2013${last} of ${total}`;
  elements.previousPage.disabled = page <= 1;
  elements.nextPage.disabled = last >= total;
  elements.clearFilters.hidden = !hasActiveFilters();
  renderTabs(counts);
}

async function autoCompleteConfirmed() {
  try {
    await sendJson(`${API_BASE}/auto-complete`, 'POST', {});
  } catch (error) {
    // Non-critical — log silently and continue
    console.warn('Auto-complete check failed:', error.message);
  }
}

async function loadBookings() {
  const requestId = ++latestRequest;

  try {
    const data = await getJson(`${API_BASE}?${buildQuery()}`);
    if (requestId !== latestRequest) return;

    if (data.bookings.length === 0 && data.total > 0 && state.page > 1) {
      state.page -= 1;
      loadBookings();
      return;
    }

    state.data = data;
    renderTable();
  } catch (error) {
    if (requestId !== latestRequest) return;

    elements.bookingWrap.hidden = true;
    elements.pagination.hidden = true;
    elements.bookingStatus.textContent = 'Unable to load bookings. Please refresh the page.';
    elements.bookingStatus.hidden = false;
    console.error(error);
  }
}

function resetToFirstPage() {
  state.page = 1;
  loadBookings();
}

async function loadServiceOptions() {
  try {
    const services = await getJson(SERVICES_API);

    services.forEach((service) => {
      const option = document.createElement('option');
      option.value = service.id;
      option.textContent = service.name;
      elements.serviceFilter.append(option);
    });
  } catch (error) {
    console.error(error);
  }
}

function fillDetailList(list, entries) {
  list.replaceChildren();

  entries.forEach(([label, value]) => {
    const term = document.createElement('dt');
    const description = document.createElement('dd');

    term.textContent = label;
    description.textContent = value || '\u2014';
    list.append(term, description);
  });
}

function addTableRow(container, label, value, className = '') {
  const row = document.createElement('tr');
  const name = document.createElement('td');
  const amount = document.createElement('td');

  name.textContent = label;
  amount.textContent = value;
  row.className = className;
  row.append(name, amount);
  container.append(row);
}

function createPaymentItem(payment) {
  const item = document.createElement('li');
  const main = document.createElement('div');
  const title = document.createElement('strong');
  const meta = document.createElement('span');
  const pill = document.createElement('span');
  const details = [payment.method];

  if (payment.referenceNumber) details.push(`Ref ${payment.referenceNumber}`);
  details.push(payment.recordedBy === 'Admin' ? 'Recorded by admin' : 'Submitted by customer');
  details.push(formatDateTime(payment.submittedAt));

  item.className = 'payment-history__item';
  title.textContent = `${payment.type}: ${formatPeso(payment.amount)}`;
  meta.className = 'payment-history__meta';
  meta.textContent = details.join(' \u00B7 ');
  main.append(title, meta);

  pill.className = `pill pill--${statusSlug(payment.status)}`;
  pill.textContent = payment.status;
  item.append(main, pill);

  if (payment.proofUrl) {
    const link = document.createElement('a');
    link.className = 'payment-history__link';
    link.href = payment.proofUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'View proof';
    item.append(link);
  }

  if (payment.rejectReason) {
    const reason = document.createElement('p');
    reason.className = 'payment-history__reason';
    reason.textContent = `Rejected: ${payment.rejectReason}`;
    item.append(reason);
  }

  if (payment.note) {
    const note = document.createElement('p');
    note.className = 'payment-history__meta';
    note.textContent = `Note: ${payment.note}`;
    item.append(note);
  }

  return item;
}

function renderBookingDetails(details) {
  elements.viewReference.textContent = `Booking #${details.reference}`;
  elements.viewTitle.textContent = details.customer.name;
  elements.viewStatus.textContent = details.status;
  elements.viewStatus.className = `pill pill--${statusSlug(details.status)}`;

  fillDetailList(elements.viewCustomer, [
    ['Email', details.customer.email],
    ['Contact', details.customer.contactNumber],
    ['Booked on', formatDateTime(details.createdAt)],
  ]);

  fillDetailList(elements.viewSchedule, [
    ['Date', formatLongDate(details.eventDate)],
    ['Time', details.timeLabel],
    ['Address', details.eventAddress],
  ]);

  elements.viewServices.replaceChildren();
  elements.viewTotals.replaceChildren();
  details.services.forEach((service) => addTableRow(elements.viewServices, service.name, formatPeso(service.price)));

  addTableRow(elements.viewTotals, 'Subtotal', formatPeso(details.subtotal));
  if (details.discountAmount > 0) {
    const label = details.voucherCode ? `Discount (${details.voucherCode})` : 'Discount';
    addTableRow(elements.viewTotals, label, `-${formatPeso(details.discountAmount)}`);
  }
  addTableRow(elements.viewTotals, 'Total', formatPeso(details.totalAmount), 'mini-table__total');
  addTableRow(elements.viewTotals, 'Paid so far', formatPeso(details.amountPaid));
  addTableRow(elements.viewTotals, `Balance \u00B7 ${details.paymentLabel}`, formatPeso(details.balance));

  elements.viewPayments.replaceChildren(...details.payments.map(createPaymentItem));
  elements.viewNoPayments.hidden = details.payments.length > 0;
  elements.editSchedule.hidden = !details.canReschedule;
}

async function openView(id) {
  try {
    viewing = await getJson(`${API_BASE}/${id}`);
    renderBookingDetails(viewing);
    elements.viewDialog.showModal();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderScheduleSlots() {
  elements.scheduleSlots.replaceChildren(...scheduleSlots.map((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'schedule-slot';
    button.textContent = slot.label;
    button.dataset.startTime = slot.startTime;
    button.setAttribute('aria-pressed', String(selectedScheduleSlot?.startTime === slot.startTime));
    if (selectedScheduleSlot?.startTime === slot.startTime) button.classList.add('schedule-slot--selected');
    return button;
  }));
}

async function loadScheduleAvailability(date) {
  const request = ++scheduleAvailabilityRequest;
  scheduleSlots = [];
  selectedScheduleSlot = null;
  elements.scheduleError.hidden = true;
  elements.scheduleSlotStatus.textContent = 'Checking available slots...';
  elements.scheduleSave.disabled = true;
  renderScheduleSlots();

  try {
    const availability = await getJson(
      `${API_BASE}/${editingSchedule.id}/availability?date=${encodeURIComponent(date)}`
    );
    if (request !== scheduleAvailabilityRequest) return;

    if (availability.wholeDay) {
      elements.scheduleSlotStatus.textContent = availability.available
        ? 'Modeling Workshop is a full-day booking. No time selection is needed.'
        : 'This date is unavailable for a Modeling Workshop.';
      elements.scheduleSave.disabled = !availability.available;
      return;
    }

    scheduleSlots = availability.slots ?? [];
    if (date === editingSchedule.eventDate) {
      selectedScheduleSlot = scheduleSlots.find((slot) => slot.startTime === editingSchedule.startTime) ?? null;
    }
    elements.scheduleSlotStatus.textContent = scheduleSlots.length
      ? `Available slots for ${availability.durationHours} hour${availability.durationHours === 1 ? '' : 's'}:`
      : 'No time slots are available on this date.';
    renderScheduleSlots();
    elements.scheduleSave.disabled = !selectedScheduleSlot;
  } catch (error) {
    if (request !== scheduleAvailabilityRequest) return;
    elements.scheduleSlotStatus.textContent = error.message || 'Could not load available slots.';
  }
}

function openScheduleEditor() {
  if (!viewing?.canReschedule) return;
  editingSchedule = viewing;
  elements.scheduleForm.reset();
  elements.scheduleDate.min = todayIso();
  elements.scheduleDate.value = viewing.eventDate;
  elements.scheduleDialog.showModal();
  loadScheduleAvailability(viewing.eventDate);
}

async function saveSchedule(event) {
  event.preventDefault();
  elements.scheduleError.hidden = true;
  if (!elements.scheduleDate.value) {
    elements.scheduleError.textContent = 'Choose a new date.';
    elements.scheduleError.hidden = false;
    return;
  }
  if (!editingSchedule.wholeDay && !selectedScheduleSlot) {
    elements.scheduleError.textContent = 'Choose an available time slot.';
    elements.scheduleError.hidden = false;
    return;
  }

  elements.scheduleSave.disabled = true;
  try {
    await sendJson(`${API_BASE}/${editingSchedule.id}`, 'PUT', {
      eventDate: elements.scheduleDate.value,
      ...(editingSchedule.wholeDay ? {} : { startTime: selectedScheduleSlot.startTime }),
    });
    elements.scheduleDialog.close();
    showToast('Booking schedule updated.');
    viewing = await getJson(`${API_BASE}/${editingSchedule.id}`);
    renderBookingDetails(viewing);
    await loadBookings();
  } catch (error) {
    elements.scheduleError.textContent = error.message;
    elements.scheduleError.hidden = false;
    elements.scheduleSave.disabled = false;
  }
}

function openConfirm({ title, message, confirmLabel, variant, action, successMessage }) {
  pendingConfirm = { action, successMessage };

  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmError.hidden = true;
  elements.confirmButton.textContent = confirmLabel;
  elements.confirmButton.className = `btn btn--${variant}`;
  elements.confirmButton.disabled = false;

  elements.confirmDialog.showModal();
}

async function runConfirmed() {
  elements.confirmButton.disabled = true;
  elements.confirmError.hidden = true;

  try {
    await pendingConfirm.action();

    elements.confirmDialog.close();
    showToast(pendingConfirm.successMessage);
    await loadBookings();
  } catch (error) {
    elements.confirmError.textContent = error.message;
    elements.confirmError.hidden = false;
    elements.confirmButton.disabled = false;
  }
}

function requiredDownpayment(total) {
  return Math.ceil((total * 100) / 2) / 100;
}

function confirmAccept(booking) {
  openConfirm({
    title: 'Accept this booking?',
    message:
      `Booking #${booking.reference} for ${booking.customerName} on ${formatDate(booking.eventDate)} (${booking.timeLabel}) ` +
      `will be accepted. The customer can then pay the 50% downpayment of ${formatPeso(requiredDownpayment(booking.totalAmount))}.`,
    confirmLabel: 'Accept booking',
    variant: 'success',
    action: () => sendJson(`${API_BASE}/${booking.id}`, 'PUT', { status: 'To Pay' }),
    successMessage: `Booking #${booking.reference} was accepted.`,
  });
}

function confirmDecline(booking) {
  openConfirm({
    title: 'Decline this booking?',
    message: `Booking #${booking.reference} from ${booking.customerName} on ${formatDate(booking.eventDate)} will be marked as Rejected. You can still move it back to Pending later.`,
    confirmLabel: 'Decline booking',
    variant: 'danger-solid',
    action: () => sendJson(`${API_BASE}/${booking.id}`, 'PUT', { status: 'Rejected' }),
    successMessage: `Booking #${booking.reference} was declined.`,
  });
}

function confirmDelete(booking) {
  const notes = [];
  if (booking.amountPaid > 0) notes.push(`The ${formatPeso(booking.amountPaid)} in recorded payments for this booking will be deleted too.`);
  if (booking.pendingPayments > 0) notes.push('Its payment waiting for review will be deleted too.');
  const paymentNote = notes.length > 0 ? ` ${notes.join(' ')}` : '';

  openConfirm({
    title: 'Delete this booking?',
    message:
      `Booking #${booking.reference} for ${booking.customerName} (${formatDate(booking.eventDate)}) will be permanently deleted.` +
      `${paymentNote} This can't be undone.`,
    confirmLabel: 'Delete booking',
    variant: 'danger-solid',
    action: () => deleteRequest(`${API_BASE}/${booking.id}`),
    successMessage: `Booking #${booking.reference} was deleted.`,
  });
}

elements.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = elements.searchInput.value.trim();
    resetToFirstPage();
  }, SEARCH_DELAY_MS);
});

elements.serviceFilter.addEventListener('change', () => {
  state.serviceId = elements.serviceFilter.value;
  resetToFirstPage();
});

elements.dateFilter.addEventListener('change', () => {
  state.date = elements.dateFilter.value;
  resetToFirstPage();
});

elements.clearFilters.addEventListener('click', () => {
  state.search = '';
  state.serviceId = '';
  state.date = '';
  elements.searchInput.value = '';
  elements.serviceFilter.value = '';
  elements.dateFilter.value = '';
  resetToFirstPage();
});

elements.statusTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.status-tab');
  if (!tab) return;

  state.status = tab.dataset.status;
  resetToFirstPage();
});

elements.previousPage.addEventListener('click', () => {
  state.page -= 1;
  loadBookings();
});

elements.nextPage.addEventListener('click', () => {
  state.page += 1;
  loadBookings();
});

elements.bookingBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const booking = state.data.bookings.find((entry) => entry.id === Number(button.closest('tr').dataset.id));
  const action = button.dataset.action;

  if (action === 'view') openView(booking.id);
  if (action === 'contract') window.open(`${CONTRACT_PAGE}?id=${booking.id}&from=admin`, '_blank');
  if (action === 'delete') confirmDelete(booking);
  if (action === 'accept') confirmAccept(booking);
  if (action === 'decline') confirmDecline(booking);
});

elements.viewContract.addEventListener('click', () => {
  if (viewing) window.open(`${CONTRACT_PAGE}?id=${viewing.id}&from=admin`, '_blank');
});

elements.editSchedule.addEventListener('click', openScheduleEditor);
elements.scheduleDate.addEventListener('change', () => loadScheduleAvailability(elements.scheduleDate.value));
elements.scheduleSlots.addEventListener('click', (event) => {
  const button = event.target.closest('[data-start-time]');
  if (!button) return;
  selectedScheduleSlot = scheduleSlots.find((slot) => slot.startTime === button.dataset.startTime) ?? null;
  renderScheduleSlots();
  elements.scheduleSave.disabled = !selectedScheduleSlot;
});
elements.scheduleForm.addEventListener('submit', saveSchedule);
elements.confirmButton.addEventListener('click', runConfirmed);

clearFieldOnInput(elements.viewDialog);
enableDialogDismiss();
loadServiceOptions();
autoCompleteConfirmed().then(() => loadBookings());
