import { getJson, postJson } from './api.js';
import { startAccountPage } from './account-page.js';
import { createCalendar } from './calendar-grid.js';
import { formatLongDate, formatPeso, formatTime } from './format.js';
import { showAlert } from './form-helpers.js';

const API_BASE = '/api/customer';

// ─── State ────────────────────────────────────────────────────────────────────

let activeStatus = '';
let openDetail = null; // current booking detail object

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const listStatus = document.getElementById('listStatus');
const bookingList = document.getElementById('bookingList');
const detailOverlay = document.getElementById('detailOverlay');
const detailClose = document.getElementById('detailClose');
const detailBody = document.getElementById('detailBody');
const cardTemplate = document.getElementById('bookingCardTemplate');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusClass = (status) => ({
  'Pending': 'pending',
  'To Pay': 'topay',
  'Confirmed': 'confirmed',
  'Completed': 'completed',
  'Rejected': 'rejected',
}[status] ?? 'pending');

function formatMinutes(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${minutes} ${meridiem}`;
}

function formatTimeRange(startMin, endMin) {
  return `${formatMinutes(startMin)} - ${formatMinutes(endMin)}`;
}

function serviceLabel(services) {
  if (!Array.isArray(services) || services.length === 0) return '—';
  return services.join(' + ');
}

// ─── Booking list ─────────────────────────────────────────────────────────────

async function loadBookings(status) {
  listStatus.textContent = 'Loading your bookings...';
  listStatus.hidden = false;
  bookingList.replaceChildren();

  const url = status ? `${API_BASE}/bookings?status=${encodeURIComponent(status)}` : `${API_BASE}/bookings`;

  try {
    const { ok, data } = await getJson(url);

    if (!ok) {
      listStatus.textContent = 'Could not load your bookings. Please try again.';
      return;
    }

    const bookings = data.bookings ?? [];

    if (bookings.length === 0) {
      listStatus.textContent = 'No bookings found.';
      return;
    }

    listStatus.hidden = true;
    bookingList.replaceChildren(...bookings.map(buildCard));
  } catch {
    listStatus.textContent = 'Unable to reach the server. Please check your connection.';
  }
}

function buildCard(booking) {
  const item = cardTemplate.content.firstElementChild.cloneNode(true);

  item.querySelector('.booking-card__ref').textContent = `BRB - ${booking.reference}`;
  item.querySelector('.booking-card__badge').textContent = booking.status;
  item.querySelector('.booking-card__services').textContent = serviceLabel(booking.services);
  item.querySelector('.booking-card__description').textContent = serviceDescription(booking.services);
  item.querySelector('.booking-card__price').textContent = formatPeso(booking.totalAmount);
  item.querySelector('.booking-card__date').textContent = formatLongDate(booking.eventDate);
  item.querySelector('.booking-card__time').textContent = booking.timeLabel;

  // Set the service image
  const img = item.querySelector('.booking-card__image');
  if (booking.imageUrl) {
    img.src = booking.imageUrl;
    img.alt = serviceLabel(booking.services);
  } else {
    img.remove();
  }

  const actions = item.querySelector('.booking-card__actions');
  const canView = ['To Pay', 'Confirmed'].includes(booking.status);
  const isOver  = ['Completed', 'Rejected'].includes(booking.status);

  if (canView) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'booking-card__btn booking-card__btn--solid';
    viewBtn.textContent = 'View Details';
    viewBtn.addEventListener('click', () => openDetailModal(booking.id));
    actions.appendChild(viewBtn);
  }

  if (isOver) {
    const againBtn = document.createElement('button');
    againBtn.className = 'booking-card__btn booking-card__btn--outline';
    againBtn.textContent = 'Book Again';
    againBtn.addEventListener('click', () => bookAgain(booking));
    actions.appendChild(againBtn);
  }

  // Show contract button for Confirmed and Completed
  if (['Confirmed', 'Completed'].includes(booking.status)) {
    const contractBtn = document.createElement('a');
    contractBtn.className = 'booking-card__btn booking-card__btn--outline';
    contractBtn.textContent = '📄 Contract';
    contractBtn.href = `contract.html?id=${booking.id}`;
    contractBtn.target = '_blank';
    contractBtn.rel = 'noopener';
    actions.appendChild(contractBtn);
  }

  // Pending: no action button — customer just waits for admin approval
  if (booking.status === 'Pending') {
    const waiting = document.createElement('p');
    waiting.className = 'booking-card__waiting';
    waiting.textContent = 'Waiting for studio approval…';
    actions.appendChild(waiting);
  }

  return item;
}

function serviceDescription(services) {
  if (!Array.isArray(services)) return '';
  const descriptions = {
    'Hair & Makeup': 'Polished hair and makeup for your moment in the spotlight',
    'Photography': 'Portrait, event and editorial sessions with professional retouching.',
    'Modeling Workshop': 'Hands-on posing, walking and confidence sessions for new talent.',
    'Pageant Training and Styling': 'Complete pageant coaching and styling.',
    'Event Coordination': 'Professional event coordination services.',
    'Event Planning': 'Comprehensive event planning and design.',
  };
  return descriptions[services[0]] ?? '';
}

function bookAgain(booking) {
  const serviceIds = (booking.services ?? []).map((_, i) => i); // We don't have IDs here; redirect to book-service
  window.location.assign('book-service.html');
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

async function openDetailModal(bookingId) {
  detailBody.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--color-muted)">Loading...</p>';
  detailOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  try {
    const { ok, data } = await getJson(`${API_BASE}/bookings/${bookingId}`);

    if (!ok) {
      detailBody.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--color-brand-dark)">Could not load booking details.</p>';
      return;
    }

    openDetail = data.booking;
    renderDetail(data.booking);
  } catch {
    detailBody.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--color-brand-dark)">Unable to reach the server.</p>';
  }
}

function closeDetailModal() {
  detailOverlay.hidden = true;
  document.body.style.overflow = '';
  openDetail = null;
}

function renderDetail(booking) {
  const canPay = ['To Pay', 'Confirmed'].includes(booking.status) && booking.balance > 0;
  const canVoucher = booking.status === 'To Pay' && !booking.voucherCode;
  const canReschedule = ['To Pay', 'Confirmed'].includes(booking.status);
  const hasPendingReschedule = booking.rescheduleRequest?.status === 'Pending';
  const paidPercent = booking.totalAmount > 0
    ? Math.round((booking.amountPaid / booking.totalAmount) * 100)
    : 0;

  const statusLabel = {
    'Pending': 'Waiting for Studio Approval',
    'To Pay': 'Approved — Awaiting Downpayment',
    'Confirmed': 'Confirmed',
    'Completed': 'Completed',
    'Rejected': 'Rejected',
  }[booking.status] ?? booking.status;

  detailBody.innerHTML = `
    <div class="detail" id="detailGrid">
      <div class="detail__ref">BOOKING SUMMARY : BRB - ${booking.reference}</div>

      <div class="detail__status-banner detail__status-banner--${statusClass(booking.status)}">
        Your Order is ${statusLabel}
      </div>

      <div class="detail__summary">
        <p class="detail__summary-title">Booking Info</p>

        <div class="detail__row">
          <span class="detail__label">Services:</span>
          <span>${(booking.services ?? []).map((s) => s.name).join('<br>')}</span>
        </div>
        <div class="detail__row">
          <span class="detail__label">Date:</span>
          <span>${formatLongDate(booking.eventDate)}</span>
        </div>
        <div class="detail__row">
          <span class="detail__label">Time:</span>
          <span>${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}</span>
        </div>
        <div class="detail__row">
          <span class="detail__label">Subtotal:</span>
          <span>${formatPeso(booking.subtotal)}</span>
        </div>
        ${booking.voucherCode ? `
        <div class="detail__row">
          <span class="detail__label">Voucher:</span>
          <span>${booking.voucherCode} (−${formatPeso(booking.discountAmount)})</span>
        </div>` : ''}
        ${canVoucher ? `
        <div class="detail__row">
          <span class="detail__label">Voucher:</span>
          <div class="detail__voucher">
            <input class="detail__voucher-input" id="voucherCode" type="text" placeholder="Enter code" maxlength="30">
            <button class="detail__voucher-btn" id="applyVoucher" type="button">Apply</button>
          </div>
        </div>
        <p class="form-alert detail__alert" id="voucherAlert" role="alert" hidden></p>
        ` : ''}
        <div class="detail__row">
          <span class="detail__label">Total:</span>
          <span id="detailTotal">${formatPeso(booking.totalAmount)}</span>
        </div>
        ${canPay ? `
        <div class="detail__row">
          <span class="detail__label">50% Downpayment:</span>
          <span class="detail__downpayment">${formatPeso(booking.requiredDownpayment)}</span>
        </div>` : ''}
      </div>

      ${canPay ? `
      <div class="detail__payment-panel">
        <p class="form-alert detail__alert" id="paymentAlert" role="alert" hidden></p>

        <div class="detail__gcash-section">
          <p class="detail__proof-label">Pay via GCash (auto-verified):</p>
          <button class="detail__gcash-btn" id="payGCash" type="button">
            Pay with GCash
          </button>
        </div>

        <div class="detail__divider"><span>or upload proof manually</span></div>

        <div class="detail__proof-upload">
          <p class="detail__proof-label">Proof of payment (screenshot):</p>
          <label class="detail__proof-drop" id="proofDrop">
            <input type="file" id="proofFile" accept="image/jpeg,image/png,image/webp" aria-label="Upload payment screenshot">
            <span class="detail__proof-icon" aria-hidden="true"></span>
            <span class="detail__proof-text" id="proofText">Upload screenshot of your payment</span>
          </label>
        </div>

        <button class="detail__submit-btn" id="submitPayment" type="button">Submit Manual Proof</button>
      </div>` : '<div></div>'}

      ${renderPaymentHistory(booking.payments)}

      ${renderRescheduleNotice(booking.rescheduleRequest)}

      ${canReschedule ? renderRescheduleSection() : ''}

      <div class="detail__modal-actions">
        ${canReschedule ? `<button class="booking-card__btn booking-card__btn--outline" id="rescheduleToggleBtn" type="button">${hasPendingReschedule ? 'Change Reschedule Request' : 'Reschedule Booking'}</button>` : ''}
        <button class="booking-card__btn booking-card__btn--outline" style="min-width:7rem;" id="closeDetailBtn" type="button">Close</button>
      </div>
    </div>
  `;

  // Bind voucher apply
  if (canVoucher) {
    document.getElementById('applyVoucher')?.addEventListener('click', () => applyVoucher(booking.id));
  }

  // Bind GCash button
  document.getElementById('payGCash')?.addEventListener('click', () => payWithGCash(booking.id));

  // Bind proof file picker
  const proofFile = document.getElementById('proofFile');
  const proofText = document.getElementById('proofText');
  if (proofFile) {
    proofFile.addEventListener('change', () => {
      const file = proofFile.files[0];
      if (file) {
        proofText.textContent = file.name;
        document.getElementById('proofDrop').classList.add('has-file');
      }
    });
  }

  // Bind payment submit
  document.getElementById('submitPayment')?.addEventListener('click', () => submitPayment(booking.id));

  // Reschedule toggle — calendar is hidden until the button is clicked
  if (canReschedule) {
    document.getElementById('rescheduleToggleBtn')?.addEventListener('click', () => {
      const section = document.getElementById('rescheduleSection');
      if (!section) return;
      const opening = section.hidden;
      section.hidden = !opening;
      if (opening && !section.dataset.initialized) {
        section.dataset.initialized = '1';
        bindRescheduleCalendar(booking.id);
      }
    });
  }

  // Bind close
  document.getElementById('closeDetailBtn')?.addEventListener('click', closeDetailModal);
}

function renderPaymentHistory(payments) {
  if (!payments || payments.length === 0) return '';

  const items = payments.map((p) => {
    const statusClass2 = p.status === 'Verified' ? '' : (p.status === 'Pending' ? 'payment-history__status--pending' : 'payment-history__status--rejected');
    return `
      <li class="payment-history__item">
        <div class="payment-history__item-left">
          <span class="payment-history__type">${p.type} — ${formatPeso(p.amount)}</span>
          <span class="payment-history__meta">${p.method} · ${p.submittedAt ? p.submittedAt.slice(0, 10) : ''}</span>
          ${p.rejectReason ? `<span class="payment-history__meta" style="color:var(--color-brand-dark)">Reason: ${p.rejectReason}</span>` : ''}
        </div>
        <span class="payment-history__status ${statusClass2}">${p.status}</span>
      </li>`;
  }).join('');

  return `
    <div class="payment-history">
      <p class="payment-history__title">Payment History</p>
      <ul class="payment-history__list">${items}</ul>
    </div>`;
}

function renderRescheduleNotice(request) {
  if (!request) return '';

  const requestedSchedule = `${formatLongDate(request.newDate)}, ${formatTime(request.newStartTime)} - ${formatTime(request.newEndTime)}`;

  const notices = {
    Pending: {
      title: 'Reschedule request pending',
      text: `You asked to move this booking to ${requestedSchedule}. Waiting for owner's approval.`,
    },
    Approved: {
      title: 'Reschedule request approved',
      text: `Your booking was moved to ${requestedSchedule}.`,
    },
    Rejected: {
      title: 'Reschedule request declined',
      text: 'The owner could not move your booking. It keeps its current schedule.',
    },
  };

  const notice = notices[request.status];
  if (!notice) return '';

  return `
    <div class="detail__reschedule-notice detail__reschedule-notice--${request.status.toLowerCase()}">
      <p class="detail__reschedule-notice-title">${notice.title}</p>
      <p>${notice.text}</p>
    </div>`;
}

function renderRescheduleSection() {
  return `
    <div class="detail__reschedule" id="rescheduleSection" hidden>
      <h3 class="detail__reschedule-title">Reschedule Date</h3>

      <div>
        <div class="calendar">
          <div class="calendar__header">
            <button class="calendar__nav calendar__nav--prev" id="rCalPrev" type="button" aria-label="Previous month"></button>
            <p class="calendar__month" id="rCalMonth" aria-live="polite"></p>
            <button class="calendar__nav calendar__nav--next" id="rCalNext" type="button" aria-label="Next month"></button>
          </div>
          <div class="calendar__weekdays" aria-hidden="true">
            <span>Sun</span><span>Mon</span><span>Tues</span><span>Wed</span><span>Thurs</span><span>Fri</span><span>Sat</span>
          </div>
          <div class="calendar__days" id="rCalDays"></div>
        </div>
      </div>

      <div class="detail__reschedule-time">
        <p style="font-size:1.1rem;font-weight:400;color:var(--color-ink-soft);margin-bottom:0.75rem;">Preferred time range</p>

        <div class="form-field">
          <label class="form-field__label" for="rTimeFrom">From:</label>
          <select class="time-select" id="rTimeFrom"></select>
        </div>

        <div class="form-field">
          <label class="form-field__label" for="rTimeTo">To:</label>
          <select class="time-select" id="rTimeTo"></select>
        </div>
      </div>

      <p class="form-alert form-alert--error detail__alert" id="rescheduleAlert" role="alert" hidden></p>

      <div class="detail__reschedule-actions">
        <button class="btn-primary" id="rescheduleSubmit" type="button" style="min-width:9rem;">
          Submit Request
        </button>
      </div>
    </div>`;
}

// ─── Calendar for reschedule ──────────────────────────────────────────────────

const OPEN_MINUTES = 7 * 60;
const CLOSE_MINUTES = 19 * 60;
const STEP_MINUTES = 30;
const DEFAULT_FROM = '09:00';
const DEFAULT_TO = '11:00';

let rescheduleDate = null;

function pad(v) { return String(v).padStart(2, '0'); }
function toTime(minutes) { return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`; }
function toMinutes(text) { const [h, m] = text.split(':').map(Number); return h * 60 + m; }

function buildTimeOptions(select, fromMin, toMin, selectedValue) {
  const opts = [];
  for (let m = fromMin; m <= toMin; m += STEP_MINUTES) {
    const o = document.createElement('option');
    o.value = toTime(m);
    o.textContent = formatTime(o.value);
    opts.push(o);
  }
  select.replaceChildren(...opts);
  select.value = selectedValue;
}

function bindRescheduleCalendar(bookingId) {
  const timeFrom = document.getElementById('rTimeFrom');
  const timeTo = document.getElementById('rTimeTo');

  if (!timeFrom || !timeTo) return;

  buildTimeOptions(timeFrom, OPEN_MINUTES, CLOSE_MINUTES - STEP_MINUTES, DEFAULT_FROM);
  buildTimeOptions(timeTo, toMinutes(DEFAULT_FROM) + STEP_MINUTES, CLOSE_MINUTES, DEFAULT_TO);

  timeFrom.addEventListener('change', () => {
    const start = toMinutes(timeFrom.value);
    const preferred = toMinutes(timeTo.value);
    const target = preferred > start ? preferred : Math.min(start + 120, CLOSE_MINUTES);
    buildTimeOptions(timeTo, start + STEP_MINUTES, CLOSE_MINUTES, toTime(target));
  });

  createCalendar(
    {
      monthLabel: document.getElementById('rCalMonth'),
      prevButton: document.getElementById('rCalPrev'),
      nextButton: document.getElementById('rCalNext'),
      dayGrid: document.getElementById('rCalDays'),
      status: { hidden: true, textContent: '' }, // dummy status element
    },
    (iso) => { rescheduleDate = iso; }
  ).load();

  document.getElementById('rescheduleSubmit')?.addEventListener('click', () => submitReschedule(bookingId));
}

// ─── API actions ──────────────────────────────────────────────────────────────

// ─── GCash via Xendit ────────────────────────────────────────────────────────

async function payWithGCash(bookingId) {
  const alertEl = document.getElementById('paymentAlert');
  const btn = document.getElementById('payGCash');

  if (!alertEl || !btn) return;

  alertEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Redirecting to GCash...';

  try {
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/gcash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.checkoutUrl) {
      // Redirect the browser to the Xendit GCash checkout page
      window.location.href = data.checkoutUrl;
    } else {
      alertEl.textContent = data.message ?? 'Could not start GCash payment. Please try again.';
      alertEl.className = 'form-alert form-alert--error detail__alert';
      alertEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Pay with GCash';
    }
  } catch {
    alertEl.textContent = 'Unable to reach the server. Please check your connection.';
    alertEl.className = 'form-alert form-alert--error detail__alert';
    alertEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Pay with GCash';
  }
}

async function applyVoucher(bookingId) {
  const input = document.getElementById('voucherCode');
  const alertEl = document.getElementById('voucherAlert');
  const btn = document.getElementById('applyVoucher');

  if (!input || !alertEl) return;

  alertEl.hidden = true;
  btn.disabled = true;

  try {
    const { ok, data } = await postJson(`${API_BASE}/bookings/${bookingId}/voucher`, { voucherCode: input.value });

    if (ok) {
      // Reload detail
      const refreshed = await getJson(`${API_BASE}/bookings/${bookingId}`);
      if (refreshed.ok) renderDetail(refreshed.data.booking);
    } else {
      alertEl.textContent = data.errors?.voucherCode ?? data.message ?? 'Could not apply voucher.';
      alertEl.className = 'form-alert form-alert--error detail__alert';
      alertEl.hidden = false;
      btn.disabled = false;
    }
  } catch {
    alertEl.textContent = 'Unable to reach the server.';
    alertEl.className = 'form-alert form-alert--error detail__alert';
    alertEl.hidden = false;
    btn.disabled = false;
  }
}

async function submitPayment(bookingId) {
  const fileInput = document.getElementById('proofFile');
  const alertEl = document.getElementById('paymentAlert');
  const btn = document.getElementById('submitPayment');

  if (!fileInput || !alertEl) return;

  alertEl.hidden = true;

  if (!fileInput.files[0]) {
    alertEl.textContent = 'Please upload a screenshot of your payment.';
    alertEl.className = 'form-alert form-alert--error detail__alert';
    alertEl.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const form = new FormData();
  form.append('proof', fileInput.files[0]);

  try {
    const response = await fetch(`${API_BASE}/bookings/${bookingId}/payment`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      alertEl.textContent = 'Payment submitted. Waiting for studio verification.';
      alertEl.className = 'form-alert form-alert--success detail__alert';
      alertEl.hidden = false;
      btn.textContent = 'Submitted';

      // Reload bookings list in background
      loadBookings(activeStatus);
    } else {
      alertEl.textContent = data.errors?.proof ?? data.message ?? 'Could not submit payment.';
      alertEl.className = 'form-alert form-alert--error detail__alert';
      alertEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  } catch {
    alertEl.textContent = 'Unable to reach the server.';
    alertEl.className = 'form-alert form-alert--error detail__alert';
    alertEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

async function submitReschedule(bookingId) {
  const alertEl = document.getElementById('rescheduleAlert');
  const btn = document.getElementById('rescheduleSubmit');
  const timeFrom = document.getElementById('rTimeFrom');
  const timeTo = document.getElementById('rTimeTo');

  if (!alertEl || !btn) return;

  alertEl.hidden = true;

  if (!rescheduleDate) {
    alertEl.textContent = 'Please choose a new date.';
    alertEl.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const { ok, data } = await postJson(`${API_BASE}/bookings/${bookingId}/reschedule`, {
      newDate: rescheduleDate,
      newStartTime: timeFrom.value,
      newEndTime: timeTo.value,
    });

    if (ok) {
      // Reload the detail view so the pending request notice appears
      loadBookings(activeStatus);
      openDetailModal(bookingId);
    } else {
      alertEl.textContent = data.errors?.newDate ?? data.errors?.newStartTime ?? data.message ?? 'Could not submit request.';
      alertEl.className = 'form-alert form-alert--error detail__alert';
      alertEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  } catch {
    alertEl.textContent = 'Unable to reach the server.';
    alertEl.className = 'form-alert form-alert--error detail__alert';
    alertEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

// ─── Status tabs ──────────────────────────────────────────────────────────────

document.querySelectorAll('.status-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.status-tab').forEach((t) => {
      t.classList.remove('status-tab--active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('status-tab--active');
    tab.setAttribute('aria-selected', 'true');
    activeStatus = tab.dataset.status;
    loadBookings(activeStatus);
  });
});

// ─── Modal close ──────────────────────────────────────────────────────────────

detailClose.addEventListener('click', closeDetailModal);

detailOverlay.addEventListener('click', (event) => {
  if (event.target === detailOverlay) closeDetailModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !detailOverlay.hidden) closeDetailModal();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const customer = await startAccountPage();
  if (!customer) return;

  // Show feedback when customer returns from GCash checkout
  const params = new URLSearchParams(window.location.search);
  const gcashResult = params.get('gcash');
  if (gcashResult) {
    const messages = {
      success:   'GCash payment submitted! Your booking will be confirmed shortly.',
      failed:    'GCash payment failed. Please try again.',
      cancelled: 'GCash payment was cancelled.',
    };
    const msg = messages[gcashResult];
    if (msg) showAlert(msg, gcashResult === 'success' ? 'success' : 'error');
    // Clean the URL so a page refresh doesn't re-show the toast
    history.replaceState(null, '', window.location.pathname);
  }

  loadBookings('');
}

init();
