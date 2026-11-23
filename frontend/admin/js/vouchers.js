import { deleteRequest, getJson, sendJson } from './admin-api.js';
import { formatDate, formatPeso } from './format.js';
import { clearFieldOnInput, clearFormErrors, enableDialogDismiss, showFormError, showToast } from './ui.js';

const API_BASE = '/api/admin/vouchers';

const elements = {
  grid: document.getElementById('voucherGrid'),
  status: document.getElementById('voucherStatus'),
  cardTemplate: document.getElementById('voucherCardTemplate'),
  addButton: document.getElementById('addVoucherButton'),
  searchInput: document.getElementById('searchInput'),

  voucherDialog: document.getElementById('voucherDialog'),
  voucherForm: document.getElementById('voucherForm'),
  voucherDialogTitle: document.getElementById('voucherDialogTitle'),
  voucherSubmit: document.getElementById('voucherSubmitButton'),
  discountPrefix: document.getElementById('discountPrefix'),

  deleteDialog: document.getElementById('deleteDialog'),
  deleteMessage: document.getElementById('deleteMessage'),
  deleteError: document.getElementById('deleteError'),
  confirmDelete: document.getElementById('confirmDeleteButton'),
};

let vouchers = [];
let editingVoucher = null;
let voucherToDelete = null;

const findVoucher = (id) => vouchers.find((voucher) => voucher.id === Number(id));

function formatDiscount(voucher) {
  return voucher.discountType === 'Percentage' ? `${voucher.discountValue}%` : formatPeso(voucher.discountValue);
}

function matchesSearch(voucher, term) {
  return voucher.code.toLowerCase().includes(term) || voucher.name.toLowerCase().includes(term);
}

function createCard(voucher) {
  const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
  const tag = card.querySelector('.voucher-card__tag');

  card.dataset.id = voucher.id;
  card.classList.toggle('voucher-card--expired', voucher.expired);

  card.querySelector('.voucher-card__code').textContent = voucher.code;
  card.querySelector('.voucher-card__value').textContent = formatDiscount(voucher);
  card.querySelector('.voucher-card__name').textContent = voucher.name;
  card.querySelector('.voucher-card__period').textContent =
    `${formatDate(voucher.startDate)} \u2013 ${formatDate(voucher.endDate)}`;
  card.querySelector('.voucher-card__limit').textContent = `Limit: ${voucher.usageLimit}`;

  tag.textContent = voucher.expired ? 'Expired' : '';
  tag.classList.toggle('tag--overdue', voucher.expired);

  card.querySelector('[data-action="edit"]').setAttribute('aria-label', `Edit ${voucher.code}`);
  card.querySelector('[data-action="remove"]').setAttribute('aria-label', `Remove ${voucher.code}`);

  return card;
}

function renderSummary() {
  const expired = vouchers.filter((voucher) => voucher.expired).length;
  const totals = { total: vouchers.length, available: vouchers.length - expired, expired };

  Object.entries(totals).forEach(([name, value]) => {
    document.querySelector(`[data-stat="${name}"]`).textContent = value;
  });
}

function renderVouchers() {
  const term = elements.searchInput.value.trim().toLowerCase();
  const visible = vouchers.filter((voucher) => matchesSearch(voucher, term));

  elements.grid.replaceChildren(...visible.map(createCard));
  renderSummary();

  elements.status.hidden = visible.length > 0;
  if (vouchers.length === 0) {
    elements.status.textContent = 'No vouchers yet. Click "+ Add Voucher" to create the first one.';
  } else if (visible.length === 0) {
    elements.status.textContent = 'No vouchers match your search.';
  }
}

async function loadVouchers() {
  try {
    vouchers = await getJson(API_BASE);
    renderVouchers();
  } catch (error) {
    console.error('Could not load vouchers:', error);
    elements.status.textContent = 'Unable to load vouchers. Please refresh the page.';
    elements.status.hidden = false;
  }
}

function updateDiscountPrefix() {
  elements.discountPrefix.textContent = elements.voucherForm.elements.discountType.value === 'Percentage' ? '%' : '\u20B1';
}

function openVoucherDialog(voucher = null) {
  const { elements: fields } = elements.voucherForm;

  editingVoucher = voucher;

  elements.voucherForm.reset();
  clearFormErrors(elements.voucherForm);

  elements.voucherDialogTitle.textContent = voucher ? 'Edit Voucher' : 'New Voucher';
  fields.code.value = voucher?.code ?? '';
  fields.name.value = voucher?.name ?? '';
  fields.discountType.value = voucher?.discountType ?? 'Percentage';
  fields.discountValue.value = voucher?.discountValue ?? '';
  fields.startDate.value = voucher?.startDate ?? '';
  fields.endDate.value = voucher?.endDate ?? '';
  fields.usageLimit.value = voucher?.usageLimit ?? '';
  updateDiscountPrefix();

  elements.voucherDialog.showModal();
  fields.code.focus();
}

async function handleVoucherSubmit(event) {
  event.preventDefault();
  clearFormErrors(elements.voucherForm);
  elements.voucherSubmit.disabled = true;

  try {
    const payload = Object.fromEntries(new FormData(elements.voucherForm));
    const saved = editingVoucher
      ? await sendJson(`${API_BASE}/${editingVoucher.id}`, 'PUT', payload)
      : await sendJson(API_BASE, 'POST', payload);

    if (editingVoucher) {
      vouchers[vouchers.findIndex((voucher) => voucher.id === saved.id)] = saved;
    } else {
      vouchers.push(saved);
    }

    renderVouchers();
    elements.voucherDialog.close();
    showToast(editingVoucher ? `${saved.code} was updated.` : `${saved.code} was added.`);
  } catch (error) {
    showFormError(elements.voucherForm, error);
  } finally {
    elements.voucherSubmit.disabled = false;
  }
}

function openDeleteDialog(voucher) {
  voucherToDelete = voucher;

  elements.deleteMessage.textContent =
    `"${voucher.code}" will be permanently removed. Bookings that already used it keep their discount, ` +
    'but customers will no longer be able to enter this code.';
  elements.deleteError.hidden = true;
  elements.confirmDelete.disabled = false;

  elements.deleteDialog.showModal();
}

async function handleConfirmDelete() {
  elements.confirmDelete.disabled = true;
  elements.deleteError.hidden = true;

  try {
    await deleteRequest(`${API_BASE}/${voucherToDelete.id}`);

    vouchers = vouchers.filter((voucher) => voucher.id !== voucherToDelete.id);
    renderVouchers();

    elements.deleteDialog.close();
    showToast(`${voucherToDelete.code} was removed.`);
  } catch (error) {
    elements.deleteError.textContent = error.message;
    elements.deleteError.hidden = false;
    elements.confirmDelete.disabled = false;
  }
}

elements.addButton.addEventListener('click', () => openVoucherDialog());
elements.searchInput.addEventListener('input', renderVouchers);

elements.grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const voucher = findVoucher(button.closest('.voucher-card').dataset.id);

  if (button.dataset.action === 'edit') openVoucherDialog(voucher);
  if (button.dataset.action === 'remove') openDeleteDialog(voucher);
});

elements.voucherForm.addEventListener('submit', handleVoucherSubmit);
elements.voucherForm.elements.discountType.addEventListener('change', updateDiscountPrefix);
elements.confirmDelete.addEventListener('click', handleConfirmDelete);

clearFieldOnInput(elements.voucherForm);
enableDialogDismiss();
loadVouchers();
