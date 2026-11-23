import { getJson, sendJson } from './admin-api.js';
import { showToast } from './ui.js';

const API = '/api/admin/reschedule';

const pageStatus  = document.getElementById('pageStatus');
const tableWrap   = document.getElementById('tableWrap');
const tableBody   = document.getElementById('tableBody');
const emptyStatus = document.getElementById('emptyStatus');
const rowTemplate = document.getElementById('rowTemplate');

const longDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function fmt(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return longDate.format(new Date(y, m - 1, d));
}

function buildRow(req) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);

  row.dataset.id = req.id;
  row.querySelector('.row-ref').textContent         = `#${req.reference}`;
  row.querySelector('.row-name').textContent        = req.customerName;
  row.querySelector('.row-services').textContent    = req.services;
  row.querySelector('.row-old-date').textContent    = fmt(req.oldDate);
  row.querySelector('.row-old-time').textContent    = req.oldTimeLabel;
  row.querySelector('.row-new-date').textContent    = fmt(req.newDate);
  row.querySelector('.row-new-time').textContent    = req.newTimeLabel;
  row.querySelector('.row-requested-at').textContent = req.requestedAt?.slice(0, 10) ?? '';

  return row;
}

async function load() {
  try {
    const { requests } = await getJson(API);

    pageStatus.hidden = true;

    if (requests.length === 0) {
      emptyStatus.hidden = false;
      return;
    }

    tableBody.replaceChildren(...requests.map(buildRow));
    tableWrap.hidden = false;
  } catch (error) {
    pageStatus.textContent = error.message;
  }
}

async function handleAction(button) {
  const row    = button.closest('tr');
  const id     = Number(row.dataset.id);
  const action = button.dataset.action;

  button.disabled = true;

  try {
    await sendJson(`${API}/${id}/${action}`, 'POST', {});

    showToast(action === 'approve'
      ? 'Reschedule request approved. Booking schedule updated.'
      : 'Reschedule request rejected.');

    row.remove();

    if (tableBody.children.length === 0) {
      tableWrap.hidden = true;
      emptyStatus.hidden = false;
    }
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
  }
}

tableBody.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (btn) handleAction(btn);
});

load();
