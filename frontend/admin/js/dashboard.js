const API_BASE = '/api/admin/dashboard';

let scheduleFirstHour = null;
let scheduleLastHour = null;

const elements = {
  stats: document.querySelectorAll('[data-stat]'),
  upcomingList: document.getElementById('upcomingList'),
  upcomingStatus: document.getElementById('upcomingStatus'),
  upcomingTemplate: document.getElementById('upcomingItemTemplate'),
  schedule: document.getElementById('schedule'),
  scheduleServices: document.getElementById('scheduleServices'),
  scheduleHours: document.getElementById('scheduleHours'),
  scheduleColumns: document.getElementById('scheduleColumns'),
  scheduleStatus: document.getElementById('scheduleStatus'),
  scheduleEventTemplate: document.getElementById('scheduleEventTemplate'),
  scheduleDate: document.getElementById('scheduleDate'),
  previousDay: document.getElementById('previousDay'),
  nextDay: document.getElementById('nextDay'),
  goToToday: document.getElementById('goToToday'),
};

const longDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const shortMonthFormat = new Intl.DateTimeFormat('en-US', { month: 'short' });

let selectedDate = new Date();
let latestScheduleRequest = 0;

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function toIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function fromIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatHourLabel(hour24) {
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour24 % 12 || 12} ${meridiem}`;
}

function parseOperatingHour(value) {
  if (!/^(?:[01]\d|2[0-3]):00$/.test(value ?? '')) return null;
  return Number(value.slice(0, 2));
}

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = false;
}

async function loadSummary() {
  try {
    const summary = await fetchJson('/summary');

    elements.stats.forEach((element) => {
      const value = summary[element.dataset.stat];
      element.textContent = Number(value).toLocaleString('en-PH');
    });
  } catch (error) {
    console.error('Could not load dashboard summary:', error);
  }
}

function createUpcomingItem(booking) {
  const item = elements.upcomingTemplate.content.cloneNode(true);
  const eventDate = fromIsoDate(booking.eventDate);

  item.querySelector('.upcoming-item__month').textContent = shortMonthFormat.format(eventDate);
  item.querySelector('.upcoming-item__day').textContent = eventDate.getDate();
  item.querySelector('.upcoming-item__service').textContent = booking.serviceName;
  item.querySelector('.upcoming-item__client').textContent =
    `${booking.clientName} - ${booking.startTime}`;

  return item;
}

async function loadUpcomingBookings() {
  try {
    const bookings = await fetchJson('/upcoming-bookings');

    elements.upcomingList.replaceChildren(...bookings.map(createUpcomingItem));
    elements.upcomingStatus.hidden = bookings.length > 0;

    if (bookings.length === 0) {
      showMessage(elements.upcomingStatus, 'No upcoming bookings.');
    }
  } catch (error) {
    console.error('Could not load upcoming bookings:', error);
    showMessage(elements.upcomingStatus, 'Unable to load upcoming bookings.');
  }
}

function createScheduleEvent(booking) {
  const event = elements.scheduleEventTemplate.content.firstElementChild.cloneNode(true);
  const gridStart = scheduleFirstHour * 60;
  const gridEnd = scheduleLastHour * 60;

  const start = Math.max(booking.startMinutes, gridStart);
  const end = Math.min(booking.endMinutes, gridEnd);

  if (end <= start) return null;

  event.style.setProperty('--start', (start - gridStart) / 60);
  event.style.setProperty('--span', (end - start) / 60);
  event.classList.add(`schedule-event--${booking.status.toLowerCase().replace(/\s+/g, '-')}`);

  event.querySelector('.schedule-event__time').textContent = booking.timeLabel;
  event.querySelector('.schedule-event__service').textContent = booking.serviceName;
  event.querySelector('.schedule-event__client').textContent = booking.clientName;

  return event;
}

function createServiceHeading(column) {
  const heading = document.createElement('div');
  heading.className = 'schedule__service';
  heading.textContent = column.serviceName;
  return heading;
}

function createServiceColumn(column) {
  const element = document.createElement('div');
  element.className = 'schedule__column';
  element.dataset.serviceId = column.serviceId;
  element.append(...column.bookings.map(createScheduleEvent).filter(Boolean));
  return element;
}

function createHourLabels() {
  const labels = [];

  for (let hour = scheduleFirstHour; hour <= scheduleLastHour; hour += 1) {
    const label = document.createElement('li');
    label.className = 'schedule__hour';
    label.style.setProperty('--index', hour - scheduleFirstHour);
    label.textContent = formatHourLabel(hour);
    labels.push(label);
  }

  return labels;
}

function renderSchedule({ columns }) {
  if (columns.length === 0) {
    elements.schedule.hidden = true;
    showMessage(elements.scheduleStatus, 'No active services to display.');
    return;
  }

  elements.schedule.style.setProperty('--column-count', columns.length);
  elements.schedule.style.setProperty('--hour-count', scheduleLastHour - scheduleFirstHour);

  elements.scheduleServices.replaceChildren(...columns.map(createServiceHeading));
  elements.scheduleHours.replaceChildren(...createHourLabels());
  elements.scheduleColumns.replaceChildren(...columns.map(createServiceColumn));

  elements.scheduleStatus.hidden = true;
  elements.schedule.hidden = false;
}

function updateScheduleTitle() {
  elements.scheduleDate.textContent = longDateFormat.format(selectedDate);
  elements.scheduleDate.dateTime = toIsoDate(selectedDate);
}

async function loadDaySchedule() {
  if (scheduleFirstHour === null || scheduleLastHour === null) return;

  const requestId = ++latestScheduleRequest;
  updateScheduleTitle();

  try {
    const schedule = await fetchJson(`/day-schedule?date=${toIsoDate(selectedDate)}`);

    if (requestId === latestScheduleRequest) renderSchedule(schedule);
  } catch (error) {
    if (requestId !== latestScheduleRequest) return;

    console.error('Could not load day schedule:', error);
    elements.schedule.hidden = true;
    showMessage(elements.scheduleStatus, 'Unable to load the day schedule.');
  }
}

async function loadScheduleHours() {
  try {
    const response = await fetch('/api/calendar/hours');
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

    const hours = await response.json();
    const openingHour = parseOperatingHour(hours.open);
    const closingHour = parseOperatingHour(hours.close);

    if (openingHour === null || closingHour === null || closingHour <= openingHour) {
      throw new Error('The configured booking hours are invalid.');
    }

    scheduleFirstHour = openingHour;
    scheduleLastHour = closingHour;
    await loadDaySchedule();
  } catch (error) {
    console.error('Could not load dashboard booking hours:', error);
    elements.schedule.hidden = true;
    showMessage(elements.scheduleStatus, 'Unable to load the day schedule.');
  }
}

function moveSelectedDate(days) {
  selectedDate = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate() + days
  );
  loadDaySchedule();
}

elements.previousDay.addEventListener('click', () => moveSelectedDate(-1));
elements.nextDay.addEventListener('click', () => moveSelectedDate(1));
elements.goToToday.addEventListener('click', () => {
  selectedDate = new Date();
  loadDaySchedule();
});

loadSummary();
loadUpcomingBookings();
loadScheduleHours();
