import { getJson, sendJson } from './admin-api.js';
import { formatDate, formatLongDate, formatPeso, statusSlug } from './format.js';
import { clearFieldOnInput, clearFormErrors, showFormError, showToast } from './ui.js';

const API_BASE = '/api/admin/workshop-students';
const BOOKING_API_BASE = '/api/admin/bookings';
const NOT_PROVIDED = 'Not provided';

function appendDetail(list, label, value) {
  const term = document.createElement('dt');
  const description = document.createElement('dd');

  term.textContent = label;
  description.textContent = value;
  list.append(term, description);
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

export function initWorkshopStudents({ onCountChange }) {
  const elements = {
    searchInput: document.getElementById('studentSearch'),
    tableWrap: document.getElementById('studentTableWrap'),
    tableBody: document.getElementById('studentBody'),
    rowTemplate: document.getElementById('studentRowTemplate'),
    status: document.getElementById('studentStatus'),

    viewDialog: document.getElementById('studentDialog'),
    viewReference: document.getElementById('studentDialogReference'),
    viewName: document.getElementById('studentDialogName'),
    viewStatus: document.getElementById('studentDialogStatus'),
    viewContact: document.getElementById('studentDialogContact'),
    viewSchedule: document.getElementById('studentDialogSchedule'),
    viewPayment: document.getElementById('studentDialogPayment'),
    viewNotice: document.getElementById('studentDialogNotice'),

    rescheduleDialog: document.getElementById('rescheduleDialog'),
    rescheduleForm: document.getElementById('rescheduleForm'),
    rescheduleReference: document.getElementById('rescheduleReference'),
    rescheduleCurrent: document.getElementById('rescheduleCurrent'),
    rescheduleSubmit: document.getElementById('rescheduleSubmit'),
  };

  let students = [];
  let reschedulingStudent = null;

  const findStudent = (bookingId) => students.find((student) => student.bookingId === Number(bookingId));

  function renderSummary() {
    const workshopOnly = students.filter((student) => student.canReschedule).length;
    const stats = {
      ongoing: students.length,
      workshopOnly,
      bundled: students.length - workshopOnly,
    };

    Object.entries(stats).forEach(([name, value]) => {
      document.querySelector(`[data-student-stat="${name}"]`).textContent = value;
    });

    onCountChange(students.length);
  }

  function createRow(student) {
    const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
    const percent = student.totalAmount > 0 ? Math.min(100, (student.amountPaid / student.totalAmount) * 100) : 0;
    const rescheduleButton = row.querySelector('[data-action="reschedule"]');

    row.dataset.id = student.bookingId;

    row.querySelector('.student-table__name').textContent = student.customerName;
    row.querySelector('.student-table__reference').textContent = `#${student.reference}`;

    row.querySelector('.student-table__service-list').textContent = student.services.join(', ');
    row.querySelector('.tag--bundled').hidden = student.canReschedule;

    row.querySelector('.student-table__date').textContent = formatDate(student.eventDate);
    row.querySelector('.student-table__time').textContent = student.timeLabel;

    row.querySelector('.student-table__amounts').textContent =
      `${formatPeso(student.amountPaid)} / ${formatPeso(student.totalAmount)}`;
    row.querySelector('.progress__bar').style.setProperty('--percent', `${percent}%`);
    row.querySelector('.student-table__payment-label').textContent = student.paymentLabel;

    const pill = row.querySelector('.pill');
    pill.classList.add(`pill--${statusSlug(student.status)}`);
    pill.textContent = student.status;

    if (!student.canReschedule) {
      rescheduleButton.disabled = true;
      rescheduleButton.title = student.rescheduleBlockedReason;
    }

    return row;
  }

  function matchesSearch(student, query) {
    return [student.customerName, student.reference, student.customerEmail]
      .some((value) => value.toLowerCase().includes(query));
  }

  function renderStudents() {
    const query = elements.searchInput.value.trim().toLowerCase();
    const visible = query ? students.filter((student) => matchesSearch(student, query)) : students;
    const isEmpty = visible.length === 0;

    elements.tableBody.replaceChildren(...visible.map(createRow));
    elements.tableWrap.hidden = isEmpty;
    elements.status.hidden = !isEmpty;

    if (isEmpty) {
      elements.status.textContent = students.length === 0
        ? 'No ongoing modeling workshops. Finished workshops are listed under Clients.'
        : 'No students match your search.';
    }
  }

  async function loadStudents() {
    try {
      ({ students } = await getJson(API_BASE));

      renderSummary();
      renderStudents();
    } catch (error) {
      elements.tableWrap.hidden = true;
      elements.status.hidden = false;
      elements.status.textContent = error.message;
    }
  }

  function renderBookingDetails(booking, student) {
    elements.viewReference.textContent = `Booking ID: #${booking.reference}`;
    elements.viewName.textContent = booking.customer.name;

    elements.viewStatus.className = `pill pill--${statusSlug(booking.status)}`;
    elements.viewStatus.textContent = booking.status;

    elements.viewContact.replaceChildren();
    appendDetail(elements.viewContact, 'Email', booking.customer.email);
    appendDetail(elements.viewContact, 'Contact number', booking.customer.contactNumber);

    elements.viewSchedule.replaceChildren();
    appendDetail(elements.viewSchedule, 'Date', formatLongDate(booking.eventDate));
    appendDetail(elements.viewSchedule, 'Time', booking.timeLabel);
    appendDetail(elements.viewSchedule, 'Venue', booking.eventAddress || NOT_PROVIDED);

    elements.viewPayment.replaceChildren();
    appendDetail(elements.viewPayment, 'Services', booking.services.map((service) => service.name).join(', '));
    appendDetail(elements.viewPayment, 'Total', formatPeso(booking.totalAmount));
    appendDetail(elements.viewPayment, 'Paid', formatPeso(booking.amountPaid));
    appendDetail(elements.viewPayment, 'Balance', formatPeso(booking.balance));
    appendDetail(elements.viewPayment, 'Payment status', booking.paymentLabel);

    elements.viewNotice.hidden = student.canReschedule;
    elements.viewNotice.textContent = student.rescheduleBlockedReason ?? '';
  }

  async function openBookingDetails(bookingId) {
    const student = findStudent(bookingId);

    try {
      renderBookingDetails(await getJson(`${BOOKING_API_BASE}/${bookingId}`), student);
      elements.viewDialog.showModal();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function openRescheduleDialog(student) {
    const { rescheduleForm } = elements;

    reschedulingStudent = student;
    clearFormErrors(rescheduleForm);

    elements.rescheduleReference.textContent = `Booking ID: #${student.reference}`;
    elements.rescheduleCurrent.textContent =
      `${student.customerName} is currently scheduled on ${formatLongDate(student.eventDate)}, ${student.timeLabel}.`;

    rescheduleForm.elements.eventDate.min = todayIso();
    rescheduleForm.elements.eventDate.value = student.eventDate;
    rescheduleForm.elements.startTime.value = student.startTime;
    rescheduleForm.elements.endTime.value = student.endTime;

    elements.rescheduleSubmit.disabled = false;
    elements.rescheduleDialog.showModal();
  }

  async function handleRescheduleSubmit(event) {
    event.preventDefault();

    const { rescheduleForm } = elements;
    const formData = new FormData(rescheduleForm);

    clearFormErrors(rescheduleForm);
    elements.rescheduleSubmit.disabled = true;

    try {
      const result = await sendJson(`${API_BASE}/${reschedulingStudent.bookingId}/schedule`, 'PATCH', {
        eventDate: formData.get('eventDate'),
        startTime: formData.get('startTime'),
        endTime: formData.get('endTime'),
      });

      elements.rescheduleDialog.close();
      showToast(`Workshop moved to ${formatDate(result.eventDate)}, ${result.timeLabel}.`);
      await loadStudents();
    } catch (error) {
      showFormError(rescheduleForm, error);
      elements.rescheduleSubmit.disabled = false;
    }
  }

  elements.searchInput.addEventListener('input', renderStudents);

  elements.tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;

    const student = findStudent(button.closest('tr').dataset.id);

    if (button.dataset.action === 'view') openBookingDetails(student.bookingId);
    if (button.dataset.action === 'reschedule') openRescheduleDialog(student);
  });

  elements.rescheduleForm.addEventListener('submit', handleRescheduleSubmit);
  clearFieldOnInput(elements.rescheduleForm);

  loadStudents();
}
