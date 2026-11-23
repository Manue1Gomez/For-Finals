const params     = new URLSearchParams(window.location.search);
const bookingId  = params.get('id');

const loading    = document.getElementById('contractLoading');
const errorEl    = document.getElementById('contractError');
const page       = document.getElementById('contractPage');

const longDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function fmt(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return longDate.format(new Date(y, m - 1, d));
}

function peso(amount) {
  const v = Number(amount);
  const dec = Number.isInteger(v) ? 0 : 2;
  return `₱ ${v.toLocaleString('en-PH', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

function set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '—';
}

function statusSlug(s) {
  return s.toLowerCase().replace(/\s+/g, '');
}

function fill(data) {
  // Header meta
  set('cReference', `BRB - ${data.reference}`);
  set('cCreatedAt', fmt(data.createdAt));
  set('cFooterRef', `BRB - ${data.reference}`);

  const badge = document.getElementById('cStatusBadge');
  badge.textContent = data.status;
  badge.className = `contract-meta__status contract-meta__status--${statusSlug(data.status)}`;

  // Client
  set('cClientName',    data.customer.name);
  set('cClientEmail',   data.customer.email);
  set('cClientContact', data.customer.contactNumber);
  set('cSigClientName', data.customer.name);

  // Schedule
  set('cEventDate', fmt(data.eventDate));
  set('cTimeLabel', data.timeLabel);
  set('cAddress',   data.eventAddress || 'To be confirmed');

  // Services table body
  const tbody = document.getElementById('cServicesBody');
  data.services.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td class="contract-table__right">${peso(s.price)}</td>`;
    tbody.appendChild(tr);
  });

  // Services table foot (subtotal, discount, total)
  const tfoot = document.getElementById('cServicesFoot');

  const addFoot = (label, value, cls = '') => {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    tr.innerHTML = `<td>${label}</td><td class="contract-table__right">${value}</td>`;
    tfoot.appendChild(tr);
  };

  addFoot('Subtotal', peso(data.subtotal));
  if (data.discountAmount > 0) {
    const label = data.voucherCode ? `Discount (${data.voucherCode})` : 'Discount';
    addFoot(label, `− ${peso(data.discountAmount)}`);
  }
  addFoot('Total Amount', peso(data.totalAmount), 'contract-table__total');

  // Payment terms DL
  const dl = document.getElementById('cPaymentDl');

  const addDl = (term, definition) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = definition;
    dl.appendChild(dt);
    dl.appendChild(dd);
  };

  addDl('Total Amount',      peso(data.totalAmount));
  addDl('50% Downpayment',   peso(data.requiredDownpayment));
  addDl('Amount Paid',       peso(data.amountPaid));
  addDl('Remaining Balance', peso(data.balance));
}

async function load() {
  if (!bookingId) {
    loading.hidden = true;
    errorEl.textContent = 'No booking ID specified.';
    errorEl.hidden = false;
    return;
  }

  try {
    const response = await fetch(`/api/contract/${bookingId}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      loading.hidden = true;
      errorEl.textContent = data.message || 'This contract could not be loaded.';
      errorEl.hidden = false;
      return;
    }

    fill(data);
    loading.hidden = true;
    page.hidden = false;

    // Auto-update page title
    document.title = `Contract BRB-${data.reference} | BRB Studios`;
  } catch {
    loading.hidden = true;
    errorEl.textContent = 'Unable to reach the server. Please check your connection.';
    errorEl.hidden = false;
  }
}

load();
