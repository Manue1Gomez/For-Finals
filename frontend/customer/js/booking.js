import { getJson, postJson } from './api.js';
import { startAccountPage } from './account-page.js';
import { createCalendar } from './calendar-grid.js';
import { formatLongDate, formatPeso, formatTime } from './format.js';
import { setSubmitting, showAlert, showNetworkError } from './form-helpers.js';

const LOGIN_PAGE = 'login.html';
const OPEN_MINUTES = 7 * 60;
const CLOSE_MINUTES = 19 * 60;
const STEP_MINUTES = 30;
const DEFAULT_FROM = '09:00';
const DEFAULT_TO = '11:00';
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const panels = [...document.querySelectorAll('.booking-step')];
const stepperSteps = document.querySelectorAll('.stepper__step');
const stepTitle = document.getElementById('stepTitle');
const stepSubtitle = document.getElementById('stepSubtitle');

const serviceStatus = document.getElementById('serviceStatus');
const serviceOptions = document.getElementById('serviceOptions');
const optionTemplate = document.getElementById('serviceOptionTemplate');
const serviceContinue = document.getElementById('serviceContinue');

const scheduleError = document.getElementById('scheduleError');
const scheduleContinue = document.getElementById('scheduleContinue');
const timeFrom = document.getElementById('timeFrom');
const timeTo = document.getElementById('timeTo');
const bookedNotice = document.getElementById('bookedNotice');
const bookedList = document.getElementById('bookedList');

const summaryDetails = document.getElementById('summaryDetails');
const summaryServices = document.getElementById('summaryServices');
const summaryDate = document.getElementById('summaryDate');
const summaryTime = document.getElementById('summaryTime');
const summarySubtotal = document.getElementById('summarySubtotal');
const summaryDiscount = document.getElementById('summaryDiscount');
const summaryTotal = document.getElementById('summaryTotal');
const submitError = document.getElementById('submitError');
const submitButton = document.getElementById('submitBooking');
const summaryBack = document.getElementById('summaryBack');
const lockedContinue = document.getElementById('lockedContinue');
const requestSent = document.getElementById('requestSent');
const voucherInput = document.getElementById('voucherInput');
const voucherApply = document.getElementById('voucherApply');
const voucherAlert = document.getElementById('voucherAlert');
const voucherSuccess = document.getElementById('voucherSuccess');

const state = {
  services: [],
  selectedIds: new Set(),
  date: null,
  bookedOnDate: [],
  bookingId: null,
  discountAmount: 0,
  pendingVoucherCode: null,
};

let bookedRequest = 0;

const pad = (value) => String(value).padStart(2, '0');
const toTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function toMinutes(text) {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
}

const selectedServices = () => state.services.filter((service) => state.selectedIds.has(service.id));

function goToStep(step) {
  const current = panels.find((panel) => Number(panel.dataset.step) === step);

  panels.forEach((panel) => {
    panel.hidden = panel !== current;
  });
  stepperSteps.forEach((item) => {
    item.classList.toggle('is-reached', Number(item.dataset.step) <= step);
  });

  stepTitle.textContent = current.dataset.title;
  stepSubtitle.textContent = current.dataset.subtitle;

  if (step === 2) renderBookedNotice();
  if (step === 3) renderSummary();

  window.scrollTo({ top: 0 });
}

function buildOption(service) {
  const item = optionTemplate.content.firstElementChild.cloneNode(true);
  const image = item.querySelector('.service-option__image');
  const input = item.querySelector('.service-option__input');

  input.value = service.id;
  input.checked = state.selectedIds.has(service.id);
  item.querySelector('.service-option__name').textContent = service.name;
  item.querySelector('.service-option__price').textContent = formatPeso(service.price);

  if (service.imageUrl) {
    image.src = service.imageUrl;
    image.alt = service.name;
  } else {
    image.remove();
  }

  return item;
}

function showServiceStatus(text) {
  serviceStatus.textContent = text;
  serviceStatus.hidden = false;
}

async function loadServices() {
  try {
    const { ok, data } = await getJson('/api/services');

    if (!ok) {
      showServiceStatus('Services could not be loaded. Please refresh the page.');
      return;
    }

    if (data.length === 0) {
      showServiceStatus('No services are available right now.');
      return;
    }

    state.services = data;

    const preselected = Number(new URLSearchParams(window.location.search).get('service'));
    if (data.some((service) => service.id === preselected)) state.selectedIds.add(preselected);

    serviceOptions.replaceChildren(...data.map(buildOption));
    serviceContinue.disabled = state.selectedIds.size === 0;
    serviceStatus.hidden = true;
  } catch {
    showServiceStatus('Unable to reach the server. Please check your connection and try again.');
  }
}

function buildTimeOptions(select, fromMinutes, toMinutesLimit, selectedValue, disabledRanges = []) {
  const options = [];

  for (let minutes = fromMinutes; minutes <= toMinutesLimit; minutes += STEP_MINUTES) {
    const option = document.createElement('option');

    option.value = toTime(minutes);
    option.textContent = formatTime(option.value);

    // Disable this slot if it falls inside any existing booking's time range
    // A slot at `minutes` conflicts if any booking starts before the slot ends (slot + 30 min)
    // and ends after the slot starts — i.e. the slot overlaps with the booked range.
    const slotEnd = minutes + STEP_MINUTES;
    const conflicts = disabledRanges.some(({ start, end }) => minutes < end && slotEnd > start);
    if (conflicts) {
      option.disabled = true;
      option.textContent += ' (unavailable)';
    }

    options.push(option);
  }

  select.replaceChildren(...options);

  // Pick selectedValue if not disabled, otherwise pick the first available slot
  const targetOption = options.find((o) => o.value === selectedValue && !o.disabled);
  const firstAvailable = options.find((o) => !o.disabled);
  select.value = targetOption ? selectedValue : (firstAvailable ? firstAvailable.value : selectedValue);
}

function getConflictRanges() {
  // Returns start/end minutes for bookings that match any of the selected services
  const names = new Set(selectedServices().map((s) => s.name));
  return state.bookedOnDate
    .filter(({ serviceName }) => names.has(serviceName))
    .map(({ startMinutes, endMinutes }) => ({ start: startMinutes, end: endMinutes }));
}

function renderTimePickers(preserveFrom, preserveTo) {
  const conflicts = getConflictRanges();

  buildTimeOptions(timeFrom, OPEN_MINUTES, CLOSE_MINUTES - STEP_MINUTES, preserveFrom ?? DEFAULT_FROM, conflicts);
  renderEndTimes(preserveTo ?? DEFAULT_TO, conflicts);
}

function renderEndTimes(preferred, conflicts = getConflictRanges()) {
  const start = toMinutes(timeFrom.value);
  const preferredMinutes = toMinutes(preferred);
  const target = preferredMinutes > start ? preferredMinutes : Math.min(start + 120, CLOSE_MINUTES);

  buildTimeOptions(timeTo, start + STEP_MINUTES, CLOSE_MINUTES, toTime(target), conflicts);
}

function renderBookedNotice() {
  const names = new Set(selectedServices().map((service) => service.name));
  const rows = state.bookedOnDate.filter(({ serviceName }) => names.has(serviceName));

  bookedList.replaceChildren(
    ...rows.map(({ serviceName, timeLabel }) => {
      const item = document.createElement('li');

      item.textContent = `${serviceName}: ${timeLabel}`;
      return item;
    })
  );
  bookedNotice.hidden = rows.length === 0;
}

async function loadBookedOnDate(iso) {
  const request = ++bookedRequest;

  state.date = iso;
  scheduleError.hidden = true;

  try {
    const { ok, data } = await getJson(`/api/calendar/day?date=${iso}`);
    if (request !== bookedRequest) return;

    state.bookedOnDate = ok ? data.booked : [];
  } catch {
    if (request !== bookedRequest) return;
    state.bookedOnDate = [];
  }

  // Rebuild time dropdowns with conflicting slots disabled
  renderTimePickers(timeFrom.value, timeTo.value);
  renderBookedNotice();
}

function renderSummary() {
  const services = selectedServices();
  const subtotal = services.reduce((sum, service) => sum + service.price, 0);
  const discount = state.discountAmount;
  const total = subtotal - discount;

  summaryServices.replaceChildren(
    ...services.map((service) => {
      const item = document.createElement('li');

      item.textContent = service.name;
      return item;
    })
  );
  summaryDate.textContent = formatLongDate(state.date);
  summaryTime.textContent = `${formatTime(timeFrom.value)} - ${formatTime(timeTo.value)}`;
  if (summarySubtotal) summarySubtotal.textContent = formatPeso(subtotal);
  if (summaryDiscount) summaryDiscount.textContent = discount > 0 ? `−${formatPeso(discount)}` : '—';
  summaryTotal.textContent = formatPeso(total);
}

function readErrorMessage(data) {
  return Object.values(data.errors ?? {})[0] || data.message || GENERIC_ERROR_MESSAGE;
}

function showRequestSent() {
  summaryDetails.hidden = true;
  requestSent.hidden = false;
  summaryBack.hidden = true;
  submitButton.hidden = true;
  lockedContinue.hidden = false;
}

async function applyVoucher() {
  if (!voucherInput || !voucherAlert || !voucherSuccess) return;

  const code = voucherInput.value.trim().toUpperCase();
  voucherAlert.hidden = true;
  voucherSuccess.hidden = true;

  if (!code) {
    showAlert(voucherAlert, 'Enter a voucher code.');
    return;
  }

  // Compute current subtotal from selected services
  const subtotal = selectedServices().reduce((sum, s) => sum + s.price, 0);

  voucherApply.disabled = true;
  voucherApply.textContent = 'Checking...';

  try {
    const response = await postJson('/api/bookings/validate-voucher', { voucherCode: code, subtotal });

    if (response.ok) {
      // Apply discount to state and re-render totals immediately
      state.discountAmount = response.data.discountAmount;
      state.pendingVoucherCode = response.data.voucherCode;
      voucherInput.disabled = true;
      voucherApply.textContent = 'Applied';
      renderSummary();
      showAlert(voucherSuccess, `Voucher applied! You save ${formatPeso(state.discountAmount)}.`);
    } else {
      const msg = response.data.errors?.voucherCode ?? response.data.message ?? 'Invalid voucher code.';
      showAlert(voucherAlert, msg);
      voucherApply.disabled = false;
      voucherApply.textContent = 'Apply';
    }
  } catch {
    showAlert(voucherAlert, 'Unable to reach the server.');
    voucherApply.disabled = false;
    voucherApply.textContent = 'Apply';
  }
}

async function submitBooking() {
  submitError.hidden = true;
  setSubmitting(submitButton, true);

  const payload = {
    serviceIds: [...state.selectedIds],
    eventDate: state.date,
    startTime: timeFrom.value,
    endTime: timeTo.value,
    voucherCode: state.pendingVoucherCode ?? '',
  };

  try {
    const response = await postJson('/api/bookings', payload);

    if (response.ok) {
      state.bookingId = response.data.id;
      showRequestSent();
      return;
    }

    if (response.status === 401) {
      window.location.assign(LOGIN_PAGE);
      return;
    }

    // Surface a voucher error back to the voucher field
    if (response.data.errors?.voucherCode && voucherAlert) {
      showAlert(voucherAlert, response.data.errors.voucherCode);
      setSubmitting(submitButton, false);
      return;
    }

    showAlert(submitError, readErrorMessage(response.data));
  } catch {
    showNetworkError(submitError);
  }

  setSubmitting(submitButton, false);
}

function continueToSummary() {
  if (!state.date) {
    showAlert(scheduleError, 'Please choose a date for your booking.');
    return;
  }

  goToStep(3);
}

serviceOptions.addEventListener('change', ({ target }) => {
  const id = Number(target.value);

  if (target.checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);

  serviceContinue.disabled = state.selectedIds.size === 0;
});

// When going to step 2, refresh time pickers with the now-selected services
serviceContinue.addEventListener('click', () => {
  goToStep(2);
  if (state.date) renderTimePickers(timeFrom.value, timeTo.value);
});

timeFrom.addEventListener('change', () => renderEndTimes(timeTo.value));
scheduleContinue.addEventListener('click', continueToSummary);
submitButton.addEventListener('click', submitBooking);
if (voucherApply) voucherApply.addEventListener('click', applyVoucher);

document.addEventListener('click', ({ target }) => {
  const trigger = target.closest('[data-go-to]');
  if (trigger) goToStep(Number(trigger.dataset.goTo));
});

const calendar = createCalendar(
  {
    monthLabel: document.getElementById('calendarMonth'),
    prevButton: document.getElementById('calendarPrev'),
    nextButton: document.getElementById('calendarNext'),
    dayGrid: document.getElementById('calendarDays'),
    status: document.getElementById('calendarStatus'),
  },
  loadBookedOnDate
);

async function init() {
  const customer = await startAccountPage();
  if (!customer) return;

  const requestedDate = new URLSearchParams(window.location.search).get('date');

  buildTimeOptions(timeFrom, OPEN_MINUTES, CLOSE_MINUTES - STEP_MINUTES, DEFAULT_FROM);
  renderEndTimes(DEFAULT_TO);
  goToStep(1);

  await Promise.all([loadServices(), requestedDate ? calendar.show(requestedDate) : calendar.load()]);
}

init();
