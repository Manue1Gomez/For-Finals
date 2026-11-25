import { getJson, sendJson } from './admin-api.js';
import { formatPeso, formatLongDate } from './format.js';

const SERVICES_API   = '/api/admin/services';
const CLIENTS_API    = '/api/admin/clients';
const WALK_IN_API    = '/api/admin/walk-in';
const VOUCHER_API    = '/api/bookings/validate-voucher';
const CALENDAR_API   = '/api/admin/calendar/month';

// â”€â”€ DOM references â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const stepIndicator  = document.getElementById('stepIndicator');

const step1          = document.getElementById('step1');
const step2existing  = document.getElementById('step2existing');
const step2new       = document.getElementById('step2new');
const step3          = document.getElementById('step3');
const step4          = document.getElementById('step4');
const stepSuccess    = document.getElementById('stepSuccess');

// Step 1
const typeCards      = document.querySelectorAll('.nb-type-card');

// Step 2 â€“ existing
const lookupEmail    = document.getElementById('lookupEmail');
const lookupError    = document.getElementById('lookupError');
const foundCustomer  = document.getElementById('foundCustomer');
const foundName      = document.getElementById('foundName');
const foundMeta      = document.getElementById('foundMeta');
const lookupBtn      = document.getElementById('lookupBtn');
const confirmLookupBtn = document.getElementById('confirmLookupBtn');
const backToStep1FromExisting = document.getElementById('backToStep1FromExisting');

// Step 2 â€“ new
const newFirstName   = document.getElementById('newFirstName');
const newLastName    = document.getElementById('newLastName');
const newEmail       = document.getElementById('newEmail');
const newContact     = document.getElementById('newContact');
const newPassword    = document.getElementById('newPassword');
const newCustomerError = document.getElementById('newCustomerError');
const backToStep1FromNew = document.getElementById('backToStep1FromNew');
const continueFromNew = document.getElementById('continueFromNew');

// Step 3
const serviceGrid       = document.getElementById('serviceGrid');
const serviceGridStatus = document.getElementById('serviceGridStatus');
const serviceError      = document.getElementById('serviceError');
// Calendar elements
const calPrev           = document.getElementById('calPrev');
const calNext           = document.getElementById('calNext');
const calMonth          = document.getElementById('calMonth');
const calGrid           = document.getElementById('calGrid');
const calStatus         = document.getElementById('calStatus');
const calSelected       = document.getElementById('calSelected');
const dateError         = document.getElementById('dateError');

const availableSlots = document.getElementById('availableSlots');
const slotStatus     = document.getElementById('slotStatus');
const slotError      = document.getElementById('slotError');
const workshopMessage = document.getElementById('workshopMessage');
const bookingHoursNote = document.getElementById('bookingHoursNote');
const bookingAddress = document.getElementById('bookingAddress');
const voucherCode    = document.getElementById('voucherCode');
const voucherHint    = document.getElementById('voucherHint');
const voucherError   = document.getElementById('voucherError');
const applyVoucherBtn = document.getElementById('applyVoucherBtn');
const orderSummary   = document.getElementById('orderSummary');
const summaryServices = document.getElementById('summaryServices');
const summaryTotals  = document.getElementById('summaryTotals');
const bookingError   = document.getElementById('bookingError');
const backToStep2    = document.getElementById('backToStep2');
const continueFromBooking = document.getElementById('continueFromBooking');

// Step 4
const dpTotal        = document.getElementById('dpTotal');
const dpRequired     = document.getElementById('dpRequired');
const paymentMethod  = document.getElementById('paymentMethod');
const paymentAmount  = document.getElementById('paymentAmount');
const markDp         = document.getElementById('markDp');
const paymentNote    = document.getElementById('paymentNote');
const paymentError   = document.getElementById('paymentError');
const backToStep3    = document.getElementById('backToStep3');
const submitBtn      = document.getElementById('submitBtn');
const amountField    = document.getElementById('amountField');

// Success
const successRef     = document.getElementById('successRef');
const successDetail  = document.getElementById('successDetail');
const anotherBookingBtn = document.getElementById('anotherBookingBtn');

// â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const state = {
  customerType: null,
  customerId: null,
  customerName: null,
  currentStep: 1,
  services: [],
  selectedServiceIds: new Set(),
  voucher: null,
  subtotal: 0,
  total: 0,
  step2Panel: null,
  selectedDate: null,       // ISO string e.g. "2026-11-15"
  slots: [],
  selectedSlot: null,
  wholeDay: false,
  dayAvailable: false,
  durationHours: 0,
};

// ── Time slot helpers ──────────────────────────────────────────────────

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

// â”€â”€ Calendar state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const today = new Date();
const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const calView = { year: today.getFullYear(), month: today.getMonth() };
let calBlockedDates = new Set();
let calBookedDates  = new Set();
let calMonthRequest = 0;

function pad(n) { return String(n).padStart(2, '0'); }
function toIso(year, month, day) { return `${year}-${pad(month + 1)}-${pad(day)}`; }
function monthStr(year, month) { return `${year}-${pad(month + 1)}`; }

async function calLoadMonth() {
  const reqId = ++calMonthRequest;
  const ms = monthStr(calView.year, calView.month);

  calStatus.textContent = 'Loadingâ€¦';
  calStatus.hidden = false;

  try {
    const data = await getJson(`${CALENDAR_API}?month=${ms}`);
    if (reqId !== calMonthRequest) return;

    calBlockedDates = new Set(data.blockedDates ?? []);
    calBookedDates  = new Set(data.bookedDates ?? []);
    calStatus.hidden = true;
  } catch {
    if (reqId !== calMonthRequest) return;
    calBlockedDates = new Set();
    calBookedDates  = new Set();
    calStatus.textContent = 'Calendar data could not be loaded.';
    calStatus.hidden = false;
  }

  calRender();
}

function calRender() {
  const year  = calView.year;
  const month = calView.month;

  calMonth.textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  calPrev.disabled = isCurrentMonth;

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];

  // Leading spacers
  for (let i = 0; i < firstDay; i++) {
    const spacer = document.createElement('span');
    cells.push(spacer);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = toIso(year, month, d);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nb-cal__day';
    btn.dataset.date = iso;
    btn.textContent = d;

    const isPast    = iso < todayIso;
    const isBlocked = calBlockedDates.has(iso);
    const hasBookings = calBookedDates.has(iso);

    if (isPast || isBlocked) {
      btn.disabled = true;
      if (isBlocked) btn.classList.add('nb-cal__day--blocked');
    }

    if (hasBookings) {
      const dot = document.createElement('span');
      dot.className = 'nb-cal__dot';
      btn.appendChild(dot);
    }

    if (iso === state.selectedDate) {
      btn.classList.add('nb-cal__day--selected');
    }

    cells.push(btn);
  }

  calGrid.replaceChildren(...cells);
}

function calSelect(iso) {
  state.selectedDate = iso;
  dateError.hidden = true;

  calGrid.querySelectorAll('.nb-cal__day').forEach((btn) => {
    btn.classList.toggle('nb-cal__day--selected', btn.dataset.date === iso);
  });

  calSelected.textContent = formatLongDate(iso);
  loadAvailability();
}

let availabilityRequest = 0;

function isWorkshopService(service) {
  return /modeling workshop/i.test(service.name);
}

function updateWorkshopSelection() {
  const selected = state.services.filter((service) => state.selectedServiceIds.has(service.id));
  const workshopSelected = selected.some(isWorkshopService);
  const regularSelected = selected.some((service) => !isWorkshopService(service));

  serviceGrid.querySelectorAll('.nb-service-card').forEach((button) => {
    const service = state.services.find((item) => item.id === Number(button.dataset.id));
    button.disabled = (workshopSelected && !isWorkshopService(service)) ||
      (regularSelected && isWorkshopService(service));
  });
  workshopMessage.hidden = !workshopSelected;
}

function renderAvailableSlots() {
  availableSlots.replaceChildren();

  if (state.wholeDay) {
    slotStatus.textContent = state.dayAvailable
      ? 'Modeling Workshop is a full-day booking. No time selection is needed.'
      : 'This date is unavailable for a Modeling Workshop.';
    return;
  }
  if (!state.selectedDate || state.selectedServiceIds.size === 0) {
    slotStatus.textContent = 'Choose services and a date to see available times.';
    return;
  }
  if (state.slots.length === 0) {
    slotStatus.textContent = 'No time slots are available for the selected services on this date.';
    return;
  }

  slotStatus.textContent = `Available slots for ${state.durationHours} hour${state.durationHours === 1 ? '' : 's'}:`;
  availableSlots.replaceChildren(...state.slots.map((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nb-slot';
    button.textContent = slot.label;
    button.dataset.startTime = slot.startTime;
    button.setAttribute('aria-pressed', String(state.selectedSlot?.startTime === slot.startTime));
    if (state.selectedSlot?.startTime === slot.startTime) button.classList.add('nb-slot--selected');
    return button;
  }));
}

async function loadAvailability() {
  const reqId = ++availabilityRequest;
  state.slots = [];
  state.selectedSlot = null;
  state.wholeDay = false;
  state.dayAvailable = false;
  slotError.hidden = true;

  if (!state.selectedDate || state.selectedServiceIds.size === 0) {
    renderAvailableSlots();
    return;
  }

  slotStatus.textContent = 'Checking available slots...';
  try {
    const params = new URLSearchParams({
      date: state.selectedDate,
      serviceIds: [...state.selectedServiceIds].join(','),
    });
    const data = await getJson(`/api/calendar/availability?${params}`);
    if (reqId !== availabilityRequest) return;
    state.slots = data.slots ?? [];
    state.wholeDay = Boolean(data.wholeDay);
    state.dayAvailable = Boolean(data.available);
    state.durationHours = data.durationHours ?? 0;
    renderAvailableSlots();
  } catch (error) {
    if (reqId !== availabilityRequest) return;
    slotStatus.textContent = error.message || 'Available slots could not be loaded.';
  }
}

calGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.nb-cal__day');
  if (btn && !btn.disabled) calSelect(btn.dataset.date);
});

calPrev.addEventListener('click', async () => {
  const prev = new Date(calView.year, calView.month - 1, 1);
  calView.year  = prev.getFullYear();
  calView.month = prev.getMonth();
  await calLoadMonth();
});

calNext.addEventListener('click', async () => {
  const next = new Date(calView.year, calView.month + 1, 1);
  calView.year  = next.getFullYear();
  calView.month = next.getMonth();
  await calLoadMonth();
});

// â”€â”€ Step navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function allPanels() {
  return [step1, step2existing, step2new, step3, step4, stepSuccess];
}

function showPanel(panel) {
  allPanels().forEach((p) => { p.hidden = true; });
  panel.hidden = false;
}

function setStep(n) {
  state.currentStep = n;
  stepIndicator.querySelectorAll('.nb-step').forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.remove('nb-step--active', 'nb-step--done');
    if (s === n) el.classList.add('nb-step--active');
    else if (s < n) el.classList.add('nb-step--done');
  });
}

// â”€â”€ Helper: field errors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function setFieldErr(input, message) {
  const field = input.closest('.field');
  if (!field) return;
  const errEl = field.querySelector('.field__error');
  if (!errEl) return;
  field.classList.toggle('field--invalid', Boolean(message));
  errEl.textContent = message || '';
  errEl.hidden = !message;
}

function clearFieldErr(input) {
  setFieldErr(input, '');
}

function clearAllErrors(panel) {
  panel.querySelectorAll('.field--invalid').forEach((f) => {
    f.classList.remove('field--invalid');
    const e = f.querySelector('.field__error');
    if (e) e.hidden = true;
  });
  panel.querySelectorAll('.alert').forEach((a) => { a.hidden = true; });
}

function peso(amount) { return formatPeso(amount); }

// â”€â”€ Step 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

typeCards.forEach((card) => {
  card.addEventListener('click', () => {
    state.customerType = card.dataset.type;

    if (state.customerType === 'existing') {
      state.step2Panel = step2existing;
      clearAllErrors(step2existing);
      lookupEmail.value = '';
      foundCustomer.hidden = true;
      confirmLookupBtn.hidden = true;
      lookupBtn.hidden = false;
      showPanel(step2existing);
    } else {
      state.step2Panel = step2new;
      clearAllErrors(step2new);
      showPanel(step2new);
    }

    setStep(2);
  });
});

// â”€â”€ Step 2 Â· Existing customer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

backToStep1FromExisting.addEventListener('click', () => {
  showPanel(step1);
  setStep(1);
});

lookupBtn.addEventListener('click', async () => {
  const email = lookupEmail.value.trim().toLowerCase();
  clearAllErrors(step2existing);

  if (!email) {
    setFieldErr(lookupEmail, 'Enter an email address.');
    return;
  }

  lookupBtn.disabled = true;
  lookupBtn.textContent = 'Looking upâ€¦';

  try {
    const data = await getJson(`${CLIENTS_API}/by-email?email=${encodeURIComponent(email)}`);

    state.customerId   = data.id;
    state.customerName = `${data.firstName} ${data.lastName}`;

    foundName.textContent = state.customerName;
    foundMeta.textContent = `${data.email} Â· ${data.contactNumber}`;
    foundCustomer.hidden  = false;
    lookupBtn.hidden      = true;
    confirmLookupBtn.hidden = false;
  } catch (error) {
    lookupError.textContent = error.status === 404
      ? 'No account found with that email address.'
      : error.message;
    lookupError.hidden = false;
  } finally {
    lookupBtn.disabled  = false;
    lookupBtn.textContent = 'Look up';
  }
});

lookupEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupBtn.click(); });
confirmLookupBtn.addEventListener('click', () => goToStep3());

// â”€â”€ Step 2 Â· New customer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

backToStep1FromNew.addEventListener('click', () => {
  showPanel(step1);
  setStep(1);
});

continueFromNew.addEventListener('click', () => {
  clearAllErrors(step2new);
  const errors = validateNewCustomer();

  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([name, msg]) => {
      const input = step2new.querySelector(`[name="${name}"]`);
      if (input) setFieldErr(input, msg);
    });
    step2new.querySelector('.field--invalid .field__input')?.focus();
    return;
  }

  state.customerName = `${newFirstName.value.trim()} ${newLastName.value.trim()}`;
  goToStep3();
});

function validateNewCustomer() {
  const errors = {};
  const NAME_RE    = /^\p{L}[\p{L} .'-]*$/u;
  const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const CONTACT_RE = /^09\d{9}$/;

  const fn = newFirstName.value.trim();
  const ln = newLastName.value.trim();
  const em = newEmail.value.trim().toLowerCase();
  const co = newContact.value.replace(/[\s-]/g, '');
  const pw = newPassword.value;

  if (!fn) errors.firstName = 'First name is required.';
  else if (fn.length > 50) errors.firstName = 'First name must be 50 characters or fewer.';
  else if (!NAME_RE.test(fn)) errors.firstName = 'Only letters, spaces, apostrophes and hyphens.';

  if (!ln) errors.lastName = 'Last name is required.';
  else if (ln.length > 50) errors.lastName = 'Last name must be 50 characters or fewer.';
  else if (!NAME_RE.test(ln)) errors.lastName = 'Only letters, spaces, apostrophes and hyphens.';

  if (!em) errors.email = 'Email address is required.';
  else if (!EMAIL_RE.test(em)) errors.email = 'Enter a valid email address.';

  if (!co) errors.contactNumber = 'Contact number is required.';
  else if (!CONTACT_RE.test(co)) errors.contactNumber = 'Enter a valid mobile number, e.g. 09123456789.';

  if (!pw) errors.password = 'Password is required.';
  else if (pw.length < 8) errors.password = 'Must be at least 8 characters.';
  else if (pw.length > 72) errors.password = 'Must be 72 characters or fewer.';
  else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errors.password = 'Must contain at least one letter and one number.';

  return errors;
}

// â”€â”€ Step 3 Â· Booking details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function goToStep3() {
  showPanel(step3);
  setStep(3);
  const results = await Promise.all([
    loadServices(),
    calLoadMonth(),
    getJson('/api/calendar/hours').catch(() => null),
  ]);
  const hoursResult = results[2];
  if (hoursResult?.open && hoursResult?.close) {
    bookingHoursNote.textContent = `Studio hours: ${formatTime(hoursResult.open)} - ${formatTime(hoursResult.close)}.`;
  } else {
    bookingHoursNote.textContent = 'Studio hours could not be loaded.';
  }
  refreshSummary();
}

backToStep2.addEventListener('click', () => {
  showPanel(state.step2Panel);
  setStep(2);
});

async function loadServices() {
  if (state.services.length > 0) return;

  serviceGrid.innerHTML = '';
  serviceGridStatus.hidden = false;
  serviceGridStatus.textContent = 'Loading servicesâ€¦';

  try {
    const services = await getJson(SERVICES_API);
    state.services = services.filter((s) => s.availability || s.availability === 1 || s.available);

    serviceGridStatus.hidden = true;
    state.services.forEach((service) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nb-service-card';
      btn.dataset.id = service.id;
      btn.innerHTML = `
        <span class="nb-service-card__name">${service.name}</span>
        <span class="nb-service-card__price">${peso(service.price)}</span>
        <span class="nb-service-card__duration">${service.durationHours === null ? 'Full day' : `${service.durationHours} hour${service.durationHours === 1 ? '' : 's'}`}</span>
      `;
      btn.addEventListener('click', () => toggleService(service, btn));
      serviceGrid.appendChild(btn);
    });

    if (state.services.length === 0) {
      serviceGridStatus.textContent = 'No services available.';
      serviceGridStatus.hidden = false;
    }
  } catch {
    serviceGridStatus.textContent = 'Could not load services. Please refresh.';
    serviceGridStatus.hidden = false;
  }
}

function toggleService(service, btn) {
  if (state.selectedServiceIds.has(service.id)) {
    state.selectedServiceIds.delete(service.id);
    btn.classList.remove('nb-service-card--selected');
  } else {
    state.selectedServiceIds.add(service.id);
    btn.classList.add('nb-service-card--selected');
  }
  updateWorkshopSelection();
  serviceError.hidden = true;
  refreshSummary();
  loadAvailability();
}

function refreshSummary() {
  const selected = state.services.filter((s) => state.selectedServiceIds.has(s.id));
  state.subtotal = selected.reduce((sum, s) => sum + Number(s.price), 0);

  const discount = state.voucher ? Number(state.voucher.discountAmount) : 0;
  state.total = Math.max(0, state.subtotal - discount);

  if (selected.length === 0) { orderSummary.hidden = true; return; }

  summaryServices.innerHTML = '';
  selected.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${peso(s.price)}</td>`;
    summaryServices.appendChild(tr);
  });

  summaryTotals.innerHTML = '';
  const addRow = (label, value, cls = '') => {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    tr.innerHTML = `<td>${label}</td><td>${value}</td>`;
    summaryTotals.appendChild(tr);
  };

  addRow('Subtotal', peso(state.subtotal));
  if (discount > 0) {
    const label = state.voucher?.voucherCode ? `Discount (${state.voucher.voucherCode})` : 'Discount';
    addRow(label, `âˆ’ ${peso(discount)}`);
  }
  addRow('Total', peso(state.total), 'nb-summary__total');
  orderSummary.hidden = false;
}

// Voucher
applyVoucherBtn.addEventListener('click', async () => {
  const code = voucherCode.value.trim().toUpperCase();
  voucherHint.hidden  = true;
  voucherError.hidden = true;

  if (!code) {
    voucherError.textContent = 'Enter a voucher code first.';
    voucherError.hidden = false;
    return;
  }
  if (state.selectedServiceIds.size === 0 || state.subtotal === 0) {
    voucherError.textContent = 'Select at least one service before applying a voucher.';
    voucherError.hidden = false;
    return;
  }

  applyVoucherBtn.disabled  = true;
  applyVoucherBtn.textContent = 'â€¦';

  try {
    const result = await sendJson(VOUCHER_API, 'POST', { voucherCode: code, subtotal: state.subtotal });
    state.voucher = result;
    voucherHint.textContent = `${result.voucherName}: âˆ’ ${peso(result.discountAmount)} applied.`;
    voucherHint.hidden = false;
    refreshSummary();
  } catch (error) {
    state.voucher = null;
    voucherError.textContent = error.message;
    voucherError.hidden = false;
    refreshSummary();
  } finally {
    applyVoucherBtn.disabled    = false;
    applyVoucherBtn.textContent = 'Apply';
  }
});

availableSlots.addEventListener('click', (event) => {
  const button = event.target.closest('[data-start-time]');
  if (!button) return;
  state.selectedSlot = state.slots.find((slot) => slot.startTime === button.dataset.startTime) ?? null;
  renderAvailableSlots();
});

continueFromBooking.addEventListener('click', () => {
  clearAllErrors(step3);
  bookingError.hidden = true;
  serviceError.hidden = true;
  dateError.hidden    = true;

  let valid = true;

  if (state.selectedServiceIds.size === 0) {
    serviceError.textContent = 'Choose at least one service.';
    serviceError.hidden = false;
    valid = false;
  }

  if (!state.selectedDate) {
    dateError.textContent = 'Choose an event date from the calendar.';
    dateError.hidden = false;
    valid = false;
  }

  if (!state.wholeDay && !state.selectedSlot) {
    slotError.textContent = 'Choose an available time slot.';
    slotError.hidden = false;
    valid = false;
  }
  if (state.wholeDay && !state.dayAvailable) {
    slotError.textContent = 'Choose an available date for the Modeling Workshop.';
    slotError.hidden = false;
    valid = false;
  }

  if (!valid) return;

  const required = Math.ceil((state.total * 100) / 2) / 100;
  dpTotal.textContent    = peso(state.total);
  dpRequired.textContent = peso(required);
  paymentAmount.value    = '';
  markDp.checked         = false;
  amountField.hidden     = false;

  showPanel(step4);
  setStep(4);
});

// â”€â”€ Step 4 Â· Payment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

backToStep3.addEventListener('click', () => {
  showPanel(step3);
  setStep(3);
});

markDp.addEventListener('change', () => {
  amountField.hidden = markDp.checked;
  if (markDp.checked) clearFieldErr(paymentAmount);
});

submitBtn.addEventListener('click', async () => {
  clearAllErrors(step4);
  paymentError.hidden = true;

  let valid = true;

  if (!paymentMethod.value) {
    setFieldErr(paymentMethod, 'Choose a payment method.');
    valid = false;
  }

  if (!markDp.checked) {
    const amt = parseFloat(paymentAmount.value);
    if (!paymentAmount.value || isNaN(amt) || amt <= 0) {
      setFieldErr(paymentAmount, 'Enter a valid amount greater than 0.');
      valid = false;
    }
  }

  if (!valid) return;

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Recordingâ€¦';

  const payload = buildPayload();

  try {
    const result = await sendJson(WALK_IN_API, 'POST', payload);

    successRef.textContent    = `Booking #${result.reference}`;
    successDetail.textContent = `${state.customerName} Â· ${result.bookingStatus}`;
    showPanel(stepSuccess);

    stepIndicator.querySelectorAll('.nb-step').forEach((el) => {
      el.classList.remove('nb-step--active');
      el.classList.add('nb-step--done');
    });
  } catch (error) {
    const fieldErrors = error.fieldErrors ?? {};
    Object.entries(fieldErrors).forEach(([name, msg]) => {
      const input = step4.querySelector(`[name="${name}"]`) ||
                    step3.querySelector(`[name="${name}"]`);
      if (input) setFieldErr(input, msg);
    });
    paymentError.textContent = error.message;
    paymentError.hidden = false;
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Record booking';
  }
});

function buildPayload() {
  const isNew = state.customerType === 'new';

  const customer = isNew ? {
    type: 'new',
    firstName:     newFirstName.value.trim(),
    lastName:      newLastName.value.trim(),
    email:         newEmail.value.trim().toLowerCase(),
    contactNumber: newContact.value.replace(/[\s-]/g, ''),
    password:      newPassword.value,
  } : {
    type: 'existing',
    id: state.customerId,
  };

  const booking = {
    serviceIds:   [...state.selectedServiceIds],
    eventDate:    state.selectedDate,
    ...(state.wholeDay ? {} : { startTime: state.selectedSlot?.startTime }),
    eventAddress: bookingAddress.value.trim() || null,
    voucherCode:  state.voucher?.voucherCode || null,
  };

  const payment = {
    method:        paymentMethod.value,
    markFullyPaid: markDp.checked,
    amount:        markDp.checked ? null : parseFloat(paymentAmount.value),
    note:          paymentNote.value.trim() || null,
  };

  return { customer, booking, payment };
}

// â”€â”€ Success reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

anotherBookingBtn.addEventListener('click', () => {
  state.customerType = null;
  state.customerId   = null;
  state.customerName = null;
  state.currentStep  = 1;
  state.selectedServiceIds.clear();
  state.voucher      = null;
  state.subtotal     = 0;
  state.total        = 0;
  state.selectedDate = null;
  state.slots = [];
  state.selectedSlot = null;
  state.wholeDay = false;
  state.dayAvailable = false;

  lookupEmail.value = '';
  foundCustomer.hidden    = true;
  confirmLookupBtn.hidden = true;
  lookupBtn.hidden        = false;
  [newFirstName, newLastName, newEmail, newContact, newPassword].forEach((i) => { i.value = ''; });
  serviceGrid.querySelectorAll('.nb-service-card--selected').forEach((c) => c.classList.remove('nb-service-card--selected'));
  calGrid.querySelectorAll('.nb-cal__day--selected').forEach((c) => c.classList.remove('nb-cal__day--selected'));
  calSelected.textContent = 'No date selected';
  availableSlots.replaceChildren();
  slotStatus.textContent = 'Choose services and a date to see available times.';
  slotError.hidden = true;
  workshopMessage.hidden = true;
  updateWorkshopSelection();
  bookingAddress.value = '';
  voucherCode.value   = '';
  voucherHint.hidden  = true;
  voucherError.hidden = true;
  orderSummary.hidden = true;
  paymentMethod.value = '';
  paymentAmount.value = '';
  markDp.checked      = false;
  amountField.hidden  = false;
  paymentNote.value   = '';

  showPanel(step1);
  setStep(1);
});

// â”€â”€ Clear field errors on input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

document.querySelectorAll('.field__input').forEach((input) => {
  input.addEventListener('input', () => clearFieldErr(input));
});
