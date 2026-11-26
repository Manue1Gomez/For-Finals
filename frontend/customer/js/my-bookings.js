import { getJson, postJson } from './api.js';
import { startAccountPage } from './account-page.js';
import { createCalendar } from './calendar-grid.js';
import { formatLongDate, formatPeso, formatTime } from './format.js';

const API_BASE = '/api/customer';

// ─── State ────────────────────────────────────────────────────────────────────

let activeStatus = '';
let openDetail = null; // current booking detail object
let proofPreviewUrl = null;
let detailViewMode = 'details';
let isPaymentFlow = false;

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
  'For Verification': 'verification',
  'Confirmed': 'confirmed',
  'Completed': 'completed',
  'Rejected': 'rejected',
}[status] ?? 'pending');

const INCOMING_STATUSES = new Set(['Pending', 'To Pay', 'For Verification', 'Confirmed']);

function clearProofPreview() {
  if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
  proofPreviewUrl = null;

  const preview = document.getElementById('proofPreview');
  const image = document.getElementById('proofPreviewImage');
  if (preview) preview.hidden = true;
  if (image) image.removeAttribute('src');
}

function showProofPreview(file) {
  clearProofPreview();
  if (!file) return;

  const preview = document.getElementById('proofPreview');
  const image = document.getElementById('proofPreviewImage');
  if (!preview || !image) return;

  proofPreviewUrl = URL.createObjectURL(file);
  image.src = proofPreviewUrl;
  preview.hidden = false;
}

function localDateIso() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

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
    bookingList.replaceChildren(...renderBookings(bookings, status));
  } catch {
    listStatus.textContent = 'Unable to reach the server. Please check your connection.';
  }
}

function renderBookings(bookings, status) {
  const today = localDateIso();
  const isIncoming = (booking) =>
    INCOMING_STATUSES.has(booking.status) && booking.eventDate >= today;
  const incoming = bookings
    .filter(isIncoming)
    .sort((first, second) =>
      first.eventDate.localeCompare(second.eventDate) || Number(first.id) - Number(second.id)
    );
  const remaining = bookings.filter((booking) => !isIncoming(booking));
  const items = [];

  if (incoming.length > 0) {
    const heading = document.createElement('li');
    heading.className = 'booking-cards__group booking-cards__group--incoming';
    heading.textContent = 'Incoming Bookings';
    items.push(heading, ...(status ? incoming.map(buildCard) : renderStatusGroups(incoming)));
  }

  if (status) return [...items, ...remaining.map(buildCard)];

  return [...items, ...renderStatusGroups(remaining)];
}

function renderStatusGroups(bookings) {
  const groups = new Map();
  bookings.forEach((booking) => {
    if (!groups.has(booking.status)) groups.set(booking.status, []);
    groups.get(booking.status).push(booking);
  });

  return [...groups].flatMap(([groupStatus, groupBookings]) => {
    const heading = document.createElement('li');
    heading.className = 'booking-cards__group';
    heading.textContent = groupStatus;
    return [heading, ...groupBookings.map(buildCard)];
  });
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
  const isOver  = ['Completed', 'Rejected'].includes(booking.status);

  if (booking.status === 'To Pay') {
    const payBtn = document.createElement('button');
    payBtn.className = 'booking-card__btn booking-card__btn--solid';
    payBtn.textContent = 'Pay';
    payBtn.addEventListener('click', () => openDetailModal(booking.id, 'payment'));
    actions.appendChild(payBtn);
  } else if (booking.status === 'Confirmed') {
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

  // Pending and payment verification: the customer waits for studio review.
  if (['Pending', 'For Verification'].includes(booking.status)) {
    const waiting = document.createElement('p');
    waiting.className = 'booking-card__waiting';
    waiting.textContent = booking.status === 'For Verification'
      ? 'Downpayment submitted — awaiting verification…'
      : 'Waiting for studio approval…';
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

async function openDetailModal(bookingId, initialView = 'details') {
  detailViewMode = initialView;
  isPaymentFlow = initialView === 'payment';
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
  clearProofPreview();
  detailOverlay.hidden = true;
  document.body.style.overflow = '';
  openDetail = null;
  detailViewMode = 'details';
  isPaymentFlow = false;
}

function renderDetail(booking) {
  clearProofPreview();
  const isPayFlow = isPaymentFlow && booking.status === 'To Pay';
  const detailViewClass = isPayFlow
    ? (detailViewMode === 'payment' ? 'detail--payment-only' : 'detail--details-only')
    : '';
  const canPay = ['To Pay', 'Confirmed'].includes(booking.status) && booking.balance > 0;
  const canVoucher = booking.status === 'To Pay' && !booking.voucherCode;
  const canReschedule = booking.canReschedule;
  const hasPendingReschedule = booking.rescheduleRequest?.status === 'Pending';
  const paymentDue = booking.status === 'To Pay'
    ? Math.max(booking.requiredDownpayment - booking.amountPaid, 0)
    : booking.balance;
  const paymentDueLabel = booking.status === 'To Pay' ? 'Downpayment due' : 'Remaining balance';
  const paidPercent = booking.totalAmount > 0
    ? Math.round((booking.amountPaid / booking.totalAmount) * 100)
    : 0;

  const statusLabel = booking.pendingPaymentReview
    ? 'Downpayment Awaiting Verification'
    : ({
      'Pending': 'Waiting for Studio Approval',
      'To Pay': 'Approved — Awaiting Downpayment',
      'For Verification': 'Downpayment Awaiting Verification',
      'Confirmed': 'Confirmed',
      'Completed': 'Completed',
      'Rejected': 'Rejected',
    }[booking.status] ?? booking.status);

  detailBody.innerHTML = `
    <div class="detail ${detailViewClass}" id="detailGrid">
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
        <p class="detail__payment-due">
          <span>${paymentDueLabel}</span>
          <strong>${formatPeso(paymentDue)}</strong>
        </p>
        <p class="form-alert detail__alert" id="paymentAlert" role="alert" hidden></p>

        <div class="detail__gcash-section">
          <p class="detail__proof-label">Pay via GCash through NetCorePay. Payment is verified automatically.</p>
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
          <div class="detail__proof-preview" id="proofPreview" hidden>
            <img id="proofPreviewImage" alt="Preview of selected payment proof">
            <button class="detail__proof-cancel" id="proofCancel" type="button" hidden>Cancel</button>
          </div>
        </div>

        <button class="detail__submit-btn" id="submitPayment" type="button">Submit Manual Proof</button>
      </div>` : '<div></div>'}

      ${renderPaymentHistory(booking.payments)}

      ${renderRescheduleNotice(booking.rescheduleRequest)}

      ${canReschedule ? renderRescheduleSection() : ''}

      <div class="detail__modal-actions">
        ${canReschedule ? `<button class="booking-card__btn booking-card__btn--outline" id="rescheduleToggleBtn" type="button">${hasPendingReschedule ? 'Change Reschedule Request' : 'Reschedule Booking'}</button>` : ''}
        ${isPayFlow ? `<button class="booking-card__btn booking-card__btn--outline" id="detailViewToggle" type="button">${detailViewMode === 'payment' ? 'View Details' : 'Back to Payment'}</button>` : ''}
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
      } else {
        proofText.textContent = 'Upload screenshot of your payment';
        document.getElementById('proofDrop').classList.remove('has-file');
      }
      document.getElementById('proofCancel').hidden = !file;
      showProofPreview(file);
    });
  }

  document.getElementById('proofCancel')?.addEventListener('click', () => {
    proofFile.value = '';
    proofText.textContent = 'Upload screenshot of your payment';
    document.getElementById('proofDrop').classList.remove('has-file');
    document.getElementById('proofCancel').hidden = true;
    showProofPreview(null);
  });

  // Bind payment submit
  document.getElementById('submitPayment')?.addEventListener('click', () => submitPayment(booking.id));

  document.getElementById('detailViewToggle')?.addEventListener('click', () => {
    const detail = document.getElementById('detailGrid');
    const toggle = document.getElementById('detailViewToggle');
    detailViewMode = detailViewMode === 'payment' ? 'details' : 'payment';
    detail.classList.toggle('detail--payment-only', detailViewMode === 'payment');
    detail.classList.toggle('detail--details-only', detailViewMode === 'details');
    toggle.textContent = detailViewMode === 'payment' ? 'View Details' : 'Back to Payment';
  });

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
        <p class="detail__reschedule-slot-status" id="rSlotStatus">Choose a date to see available slots.</p>
        <div class="detail__reschedule-slots" id="rSlots" role="group" aria-label="Available reschedule time slots"></div>
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

let rescheduleDate = null;
let rescheduleSlots = [];
let selectedRescheduleSlot = null;
let rescheduleAvailabilityRequest = 0;

function bindRescheduleCalendar(bookingId) {
  rescheduleDate = null;
  rescheduleSlots = [];
  selectedRescheduleSlot = null;

  createCalendar(
    {
      monthLabel: document.getElementById('rCalMonth'),
      prevButton: document.getElementById('rCalPrev'),
      nextButton: document.getElementById('rCalNext'),
      dayGrid: document.getElementById('rCalDays'),
      status: { hidden: true, textContent: '' }, // dummy status element
    },
    (iso) => {
      rescheduleDate = iso;
      selectedRescheduleSlot = null;
      loadRescheduleAvailability(bookingId, iso);
    }
  ).load();

  document.getElementById('rSlots')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-start-time]');
    if (!button) return;
    selectedRescheduleSlot = rescheduleSlots.find((slot) => slot.startTime === button.dataset.startTime) ?? null;
    renderRescheduleSlots();
  });
  document.getElementById('rescheduleSubmit')?.addEventListener('click', () => submitReschedule(bookingId));
}

function renderRescheduleSlots() {
  const slotsElement = document.getElementById('rSlots');
  if (!slotsElement) return;

  slotsElement.replaceChildren(...rescheduleSlots.map((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'detail__reschedule-slot';
    button.textContent = slot.label;
    button.dataset.startTime = slot.startTime;
    button.setAttribute('aria-pressed', String(selectedRescheduleSlot?.startTime === slot.startTime));
    if (selectedRescheduleSlot?.startTime === slot.startTime) {
      button.classList.add('detail__reschedule-slot--selected');
    }
    return button;
  }));
}

async function loadRescheduleAvailability(bookingId, date) {
  const request = ++rescheduleAvailabilityRequest;
  const status = document.getElementById('rSlotStatus');
  if (!status) return;
  rescheduleSlots = [];
  selectedRescheduleSlot = null;
  status.textContent = 'Checking available slots...';
  renderRescheduleSlots();

  try {
    const { ok, data } = await getJson(
      `${API_BASE}/bookings/${bookingId}/reschedule-availability?date=${encodeURIComponent(date)}`
    );
    if (request !== rescheduleAvailabilityRequest) return;
    if (!ok) throw new Error(data.message ?? 'Could not load available slots.');
    rescheduleSlots = data.slots ?? [];
    status.textContent = rescheduleSlots.length
      ? `Available slots for ${data.durationHours} hour${data.durationHours === 1 ? '' : 's'}:`
      : 'No time slots are available on this date. Please choose another date.';
    renderRescheduleSlots();
  } catch (error) {
    if (request !== rescheduleAvailabilityRequest) return;
    status.textContent = error.message || 'Unable to load available slots.';
  }
}

// ─── API actions ──────────────────────────────────────────────────────────────

// ─── GCash via NetCorePay ────────────────────────────────────────────────────

async function payWithGCash(bookingId) {
  const alertEl = document.getElementById('paymentAlert');
  const btn = document.getElementById('payGCash');

  if (!alertEl || !btn) return;

  alertEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Opening NetCorePay...';

  try {
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/gcash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.checkoutUrl) {
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
      fileInput.disabled = true;
      document.getElementById('proofCancel').hidden = true;
      document.getElementById('payGCash')?.setAttribute('disabled', '');
      detailBody.querySelector('.detail__payment-panel')?.classList.add('detail__payment-panel--submitted');

      if (openDetail?.id === bookingId) {
        openDetail = { ...openDetail, status: 'For Verification', pendingPaymentReview: true };
        const statusBanner = detailBody.querySelector('.detail__status-banner');
        if (statusBanner) {
          statusBanner.className = `detail__status-banner detail__status-banner--${statusClass('For Verification')}`;
          statusBanner.textContent = 'Your Order is Downpayment Awaiting Verification';
        }
      }

      selectStatus('For Verification');
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
  if (!alertEl || !btn) return;

  alertEl.hidden = true;

  if (!rescheduleDate) {
    alertEl.textContent = 'Please choose a new date.';
    alertEl.hidden = false;
    return;
  }
  if (!selectedRescheduleSlot) {
    alertEl.textContent = 'Choose an available time slot.';
    alertEl.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const { ok, data } = await postJson(`${API_BASE}/bookings/${bookingId}/reschedule`, {
      newDate: rescheduleDate,
      newStartTime: selectedRescheduleSlot.startTime,
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

function selectStatus(status) {
  document.querySelectorAll('.status-tab').forEach((tab) => {
    const isActive = tab.dataset.status === status;
    tab.classList.toggle('status-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  activeStatus = status;
}

document.querySelectorAll('.status-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    selectStatus(tab.dataset.status);
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

  const params = new URLSearchParams(window.location.search);
  const gcashResult = params.get('gcash');
  const bookingId = Number(params.get('booking'));
  const paymentId = params.get('payment');
  if (gcashResult) {
    history.replaceState(null, '', window.location.pathname);
  }

  await loadBookings('');

  if (gcashResult === 'returned' && Number.isInteger(bookingId) && bookingId > 0) {
    await openDetailModal(bookingId);
    const alertEl = document.getElementById('paymentAlert');
    const payment = openDetail?.payments?.find((entry) => String(entry.id) === paymentId);

    if (alertEl) {
      alertEl.textContent = payment?.status === 'Verified'
        ? 'NetCorePay confirmed your GCash payment.'
        : payment?.status === 'Rejected'
          ? 'The GCash payment was not completed. You can try again.'
          : 'Checkout returned. Waiting for NetCorePay payment confirmation; refresh this booking shortly.';
      alertEl.className = payment?.status === 'Verified'
        ? 'form-alert form-alert--success detail__alert'
        : payment?.status === 'Rejected'
          ? 'form-alert form-alert--error detail__alert'
          : 'form-alert form-alert--pending detail__alert';
      alertEl.hidden = false;
    }
  }
}

init();
