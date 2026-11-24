import { getJson } from './admin-api.js';
import { formatDate, formatPeso, statusSlug } from './format.js';
import { showToast } from './ui.js';

const API_BASE = '/api/admin/clients';
const SEARCH_DELAY_MS = 300;
const DEFAULT_SORT = 'mostBookings';
const NOT_AVAILABLE = '\u2014';

function appendDetail(list, label, value) {
  const term = document.createElement('dt');
  const description = document.createElement('dd');

  term.textContent = label;
  description.textContent = value;
  list.append(term, description);
}

export function initClientList() {
  const elements = {
    searchInput: document.getElementById('clientSearch'),
    sortSelect: document.getElementById('clientSort'),
    clearButton: document.getElementById('clientClear'),

    tableWrap: document.getElementById('clientTableWrap'),
    tableBody: document.getElementById('clientBody'),
    rowTemplate: document.getElementById('clientRowTemplate'),
    status: document.getElementById('clientStatus'),

    pagination: document.getElementById('clientPagination'),
    pageSummary: document.getElementById('clientPageSummary'),
    previousButton: document.getElementById('clientPrevious'),
    nextButton: document.getElementById('clientNext'),

    dialog: document.getElementById('clientDialog'),
    dialogName: document.getElementById('clientDialogName'),
    dialogContact: document.getElementById('clientDialogContact'),
    dialogStats: document.getElementById('clientDialogStats'),
    dialogBookings: document.getElementById('clientDialogBookings'),
    dialogNoBookings: document.getElementById('clientDialogNoBookings'),
  };

  const state = { search: '', sort: DEFAULT_SORT, page: 1 };

  let searchTimer = null;
  let latestRequest = 0;

  const hasActiveFilters = () => state.search !== '' || state.sort !== DEFAULT_SORT;

  function renderSummary(summary) {
    Object.entries(summary).forEach(([name, value]) => {
      const target = document.querySelector(`[data-client-stat="${name}"]`);
      if (target) target.textContent = value;
    });
  }

  function createRow(client) {
    const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
    const hasBookings = client.totalBookings > 0;

    row.dataset.id = client.id;

    row.querySelector('.client-table__name').textContent = client.name;
    row.querySelector('.client-table__email').textContent = client.email;
    row.querySelector('.tag--workshop').hidden = !client.hasOngoingWorkshop;

    row.querySelector('.client-table__contact').textContent = client.contactNumber;
    row.querySelector('.client-table__total').textContent = client.totalBookings;
    row.querySelector('.client-table__completed').textContent = hasBookings
      ? `${client.completedBookings} completed`
      : 'No bookings yet';
    row.querySelector('.client-table__paid').textContent = formatPeso(client.totalPaid);
    row.querySelector('.client-table__last').textContent = client.lastBookingDate
      ? formatDate(client.lastBookingDate)
      : NOT_AVAILABLE;

    return row;
  }

  function renderPagination({ page, pageSize, total }) {
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);

    elements.pageSummary.textContent = `Showing ${first}\u2013${last} of ${total} clients`;
    elements.previousButton.disabled = page <= 1;
    elements.nextButton.disabled = last >= total;
    elements.pagination.hidden = total <= pageSize;
  }

  function renderList(data) {
    const isEmpty = data.clients.length === 0;

    renderSummary(data.summary);
    elements.tableBody.replaceChildren(...data.clients.map(createRow));
    elements.tableWrap.hidden = isEmpty;
    elements.status.hidden = !isEmpty;

    if (isEmpty) {
      elements.status.textContent = state.search ? 'No clients match your search.' : 'No registered clients yet.';
    }

    renderPagination(data);
  }

  async function loadClients() {
    const requestId = ++latestRequest;
    const params = new URLSearchParams({ sort: state.sort, page: state.page });

    if (state.search) params.set('search', state.search);

    try {
      const data = await getJson(`${API_BASE}?${params}`);

      if (requestId === latestRequest) renderList(data);
    } catch (error) {
      if (requestId !== latestRequest) return;

      elements.tableWrap.hidden = true;
      elements.pagination.hidden = true;
      elements.status.hidden = false;
      elements.status.textContent = error.message;
    }
  }

  function applyFilters() {
    state.page = 1;
    elements.clearButton.hidden = !hasActiveFilters();
    loadClients();
  }

  function createHistoryRow(booking) {
    const row = document.createElement('tr');
    const cells = [
      `#${booking.reference}`,
      booking.services.join(', '),
      formatDate(booking.eventDate),
      null,
      `${formatPeso(booking.amountPaid)} / ${formatPeso(booking.totalAmount)}`,
    ];

    cells.forEach((text) => {
      const cell = document.createElement('td');

      if (text === null) {
        const pill = document.createElement('span');

        pill.className = `pill pill--${statusSlug(booking.status)}`;
        pill.textContent = booking.status;
        cell.append(pill);
      } else {
        cell.textContent = text;
      }

      row.append(cell);
    });

    return row;
  }

  function renderProfile({ client, stats, bookings }) {
    elements.dialogName.textContent = client.name;

    elements.dialogContact.replaceChildren();
    appendDetail(elements.dialogContact, 'Email', client.email);
    appendDetail(elements.dialogContact, 'Contact number', client.contactNumber);

    const statCards = [
      ['Bookings', stats.totalBookings],
      ['Completed', stats.completedBookings],
      ['Total paid', formatPeso(stats.totalPaid)],
    ].map(([label, value]) => {
      const card = document.createElement('div');
      const labelElement = document.createElement('p');
      const valueElement = document.createElement('p');

      card.className = 'profile-stat';
      labelElement.className = 'profile-stat__label';
      valueElement.className = 'profile-stat__value';
      labelElement.textContent = label;
      valueElement.textContent = value;
      card.append(labelElement, valueElement);

      return card;
    });

    elements.dialogStats.replaceChildren(...statCards);
    elements.dialogBookings.replaceChildren(...bookings.map(createHistoryRow));
    elements.dialogNoBookings.hidden = bookings.length > 0;
  }

  async function openProfile(clientId) {
    try {
      renderProfile(await getJson(`${API_BASE}/${clientId}`));
      elements.dialog.showModal();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  elements.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
      state.search = elements.searchInput.value.trim();
      applyFilters();
    }, SEARCH_DELAY_MS);
  });

  elements.sortSelect.addEventListener('change', () => {
    state.sort = elements.sortSelect.value;
    applyFilters();
  });

  elements.clearButton.addEventListener('click', () => {
    state.search = '';
    state.sort = DEFAULT_SORT;
    elements.searchInput.value = '';
    elements.sortSelect.value = DEFAULT_SORT;
    applyFilters();
  });

  elements.previousButton.addEventListener('click', () => {
    state.page -= 1;
    loadClients();
  });

  elements.nextButton.addEventListener('click', () => {
    state.page += 1;
    loadClients();
  });

  elements.tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="view"]');
    if (button) openProfile(button.closest('tr').dataset.id);
  });

  loadClients();
}
