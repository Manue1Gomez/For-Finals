import { getJson } from './api.js';
import { createCalendar } from './calendar-grid.js';
import { bookingUrl, loadCustomer } from './session.js';

const dayHeading = document.getElementById('dayHeading');
const dayStatus = document.getElementById('dayStatus');
const dayList = document.getElementById('dayList');
const dayBookLink = document.getElementById('dayBookLink');
const rowTemplate = document.getElementById('bookedRowTemplate');

let customer = null;
let dayRequest = 0;

function formatLongDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function showDayStatus(text) {
  dayStatus.textContent = text;
  dayStatus.hidden = false;
}

function buildRow({ serviceName, timeLabel }) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);

  row.querySelector('.day-panel__service').textContent = serviceName;
  row.querySelector('.day-panel__time').textContent = timeLabel;

  return row;
}

async function loadDay(iso) {
  const request = ++dayRequest;

  dayHeading.textContent = formatLongDate(iso);
  dayList.replaceChildren();
  dayBookLink.hidden = true;
  showDayStatus('Loading bookings...');

  try {
    const { ok, data } = await getJson(`/api/calendar/day?date=${iso}`);
    if (request !== dayRequest) return;

    if (!ok) throw new Error('Request failed');

    if (data.blocked) {
      showDayStatus('This date is unavailable.');
      return;
    }

    dayList.replaceChildren(...data.booked.map(buildRow));
    dayBookLink.setAttribute('href', bookingUrl(customer, { date: iso }));
    dayBookLink.hidden = false;

    if (data.booked.length > 0) dayStatus.hidden = true;
    else showDayStatus('No bookings yet. This date is open.');
  } catch {
    if (request !== dayRequest) return;
    showDayStatus('Bookings for this date could not be loaded.');
  }
}

const calendar = createCalendar(
  {
    monthLabel: document.getElementById('calendarMonth'),
    prevButton: document.getElementById('calendarPrev'),
    nextButton: document.getElementById('calendarNext'),
    dayGrid: document.getElementById('calendarDays'),
    status: document.getElementById('calendarStatus'),
  },
  loadDay
);

async function init() {
  customer = await loadCustomer();
  await calendar.load();

  if (calendar.isSelectable(calendar.todayIso)) calendar.select(calendar.todayIso);
}

init();
