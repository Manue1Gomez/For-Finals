import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { getJson, sendJson } from '../lib/adminApi.js';

const CLIENTS_API = '/api/admin/clients';
const STUDENTS_API = '/api/admin/workshop-students';
const BOOKINGS_API = '/api/admin/bookings';
const SEARCH_DELAY_MS = 300;
const DEFAULT_SORT = 'mostBookings';
const NOT_AVAILABLE = '—';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function fromIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  return value ? DATE_FORMAT.format(fromIsoDate(value)) : NOT_AVAILABLE;
}

function formatLongDate(value) {
  return value ? LONG_DATE_FORMAT.format(fromIsoDate(value)) : NOT_AVAILABLE;
}

function formatPeso(value) {
  const amount = Number(value);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function statusSlug(status) {
  return String(status).toLowerCase().replace(/\s+/g, '-');
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function DetailList({ items }) {
  return (
    <dl className="detail-list">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Dialog({ open, dialogRef, className = '', labelledBy, onClose, children }) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      className={`dialog ${className}`.trim()}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

export default function AdminClientsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(location.hash === '#students' ? 'students' : 'clients');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [clientData, setClientData] = useState(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [clientError, setClientError] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [students, setStudents] = useState([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentError, setStudentError] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentProfile, setStudentProfile] = useState(null);
  const [studentProfileOpen, setStudentProfileOpen] = useState(false);
  const [rescheduleStudent, setRescheduleStudent] = useState(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);

  const clientDialogRef = useRef(null);
  const studentDialogRef = useRef(null);
  const rescheduleDialogRef = useRef(null);
  const searchTimer = useRef(null);
  const latestClientRequest = useRef(0);

  useEffect(() => {
    const requestId = ++latestClientRequest.current;
    setClientLoading(true);
    setClientError('');
    const params = new URLSearchParams({ sort, page: String(page) });
    if (search) params.set('search', search);

    getJson(`${CLIENTS_API}?${params}`)
      .then((data) => {
        if (requestId !== latestClientRequest.current) return;
        if (!Array.isArray(data.clients) || !data.summary) {
          throw new Error('The server returned an invalid client list.');
        }
        setClientData(data);
      })
      .catch((error) => {
        if (requestId === latestClientRequest.current) setClientError(error.message || 'Unable to load clients.');
      })
      .finally(() => {
        if (requestId === latestClientRequest.current) setClientLoading(false);
      });
  }, [search, sort, page]);

  async function loadStudents(initial = false) {
    if (initial) setStudentLoading(true);
    setStudentError('');
    try {
      const data = await getJson(STUDENTS_API);
      if (!Array.isArray(data.students)) throw new Error('The server returned an invalid workshop student list.');
      setStudents(data.students);
    } catch (error) {
      setStudentError(error.message || 'Unable to load workshop students.');
    } finally {
      if (initial) setStudentLoading(false);
    }
  }

  useEffect(() => {
    void loadStudents(true);
  }, []);

  useEffect(() => {
    setActiveTab(location.hash === '#students' ? 'students' : 'clients');
  }, [location.hash]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function selectTab(tab, focus = false) {
    setActiveTab(tab);
    navigate({
      pathname: location.pathname,
      search: location.search,
      hash: tab === 'students' ? '#students' : '',
    }, { replace: true });
    if (focus) {
      window.requestAnimationFrame(() => document.getElementById(`${tab}Tab`)?.focus());
    }
  }

  function handleTabKeydown(event) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    selectTab(activeTab === 'clients' ? 'students' : 'clients', true);
  }

  function handleSearchChange(value) {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setSearch(value.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
  }

  async function openClientProfile(clientId) {
    try {
      const data = await getJson(`${CLIENTS_API}/${clientId}`);
      setProfile(data);
      setProfileOpen(true);
    } catch (error) {
      setToast({ message: error.message || 'Unable to load this client.', type: 'error' });
    }
  }

  async function openStudentProfile(student) {
    try {
      const booking = await getJson(`${BOOKINGS_API}/${student.bookingId}`);
      setStudentProfile({ booking, student });
      setStudentProfileOpen(true);
    } catch (error) {
      setToast({ message: error.message || 'Unable to load this workshop student.', type: 'error' });
    }
  }

  function openReschedule(student) {
    setRescheduleStudent(student);
    setRescheduleDate(student.eventDate);
    setRescheduleError('');
    setFieldError('');
    setRescheduleOpen(true);
  }

  async function submitReschedule(event) {
    event.preventDefault();
    if (!rescheduleStudent || saving) return;
    setSaving(true);
    setRescheduleError('');
    setFieldError('');
    try {
      const result = await sendJson(
        `${STUDENTS_API}/${rescheduleStudent.bookingId}/schedule`,
        'PATCH',
        { eventDate: rescheduleDate }
      );
      setRescheduleOpen(false);
      setToast({ message: `Workshop moved to ${formatDate(result.eventDate)}.`, type: 'success' });
      await loadStudents();
    } catch (error) {
      const dateError = error.fieldErrors?.eventDate;
      setFieldError(dateError || '');
      setRescheduleError(dateError ? '' : (error.message || 'Unable to reschedule this workshop.'));
    } finally {
      setSaving(false);
    }
  }

  const visibleStudents = studentSearch.trim()
    ? students.filter((student) => [student.customerName, student.reference, student.customerEmail]
        .some((value) => String(value).toLowerCase().includes(studentSearch.trim().toLowerCase())))
    : students;

  const workshopOnly = students.filter((student) => student.canReschedule).length;
  const summary = clientData?.summary;
  const clients = clientData?.clients ?? [];
  const isEmptyClients = !clientLoading && !clientError && clients.length === 0;
  const pageSize = clientData?.pageSize ?? 0;
  const total = clientData?.total ?? 0;
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = pageSize ? Math.min(page * pageSize, total) : 0;

  return (
    <AdminLayout activePage="clients" title="Clients | BRB Studios Admin">
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Client Management</p>
          <h1 className="page-header__title">Clients</h1>
        </header>

        <div className="page-tabs" role="tablist" aria-label="Client sections">
          <button
            className={`page-tab${activeTab === 'clients' ? ' page-tab--active' : ''}`}
            type="button"
            role="tab"
            id="clientsTab"
            aria-controls="clientsPanel"
            aria-selected={activeTab === 'clients'}
            tabIndex={activeTab === 'clients' ? 0 : -1}
            onClick={() => selectTab('clients')}
            onKeyDown={handleTabKeydown}
          >
            Clients
          </button>
          <button
            className={`page-tab${activeTab === 'students' ? ' page-tab--active' : ''}`}
            type="button"
            role="tab"
            id="studentsTab"
            aria-controls="studentsPanel"
            aria-selected={activeTab === 'students'}
            tabIndex={activeTab === 'students' ? 0 : -1}
            onClick={() => selectTab('students')}
            onKeyDown={handleTabKeydown}
          >
            Modeling Workshop Students
            <span className="page-tab__count">{students.length}</span>
          </button>
        </div>

        <section className="tab-panel" id="clientsPanel" role="tabpanel" aria-labelledby="clientsTab" hidden={activeTab !== 'clients'}>
          <div className="summary-cards" aria-label="Client summary">
            {[
              ['Total Clients', summary?.totalClients],
              ['Repeat Clients', summary?.repeatClients],
              ['With Active Bookings', summary?.activeClients],
            ].map(([label, value]) => (
              <article className="panel summary-card" key={label}>
                <h2 className="summary-card__label">{label}</h2>
                <p className="summary-card__value">{value ?? '—'}</p>
              </article>
            ))}
          </div>

          <div className="panel toolbar">
            <label className="toolbar__search">
              <span className="visually-hidden">Search clients</span>
              <span className="toolbar__search-icon" aria-hidden="true"></span>
              <input
                className="field__input toolbar__search-input"
                type="search"
                placeholder="Search name, email or contact number"
                autoComplete="off"
                maxLength="100"
                onChange={(event) => handleSearchChange(event.target.value)}
              />
            </label>
            <label className="toolbar__select">
              <span className="visually-hidden">Sort clients</span>
              <select className="field__input" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
                <option value="mostBookings">Most bookings</option>
                <option value="highestPaid">Highest total paid</option>
                <option value="recentBooking">Most recent booking</option>
                <option value="name">Name (A to Z)</option>
                <option value="newest">Newest account</option>
              </select>
            </label>
            {(search || sort !== DEFAULT_SORT) && (
              <button
                className="toolbar__clear"
                type="button"
                onClick={() => {
                  setSearch('');
                  setSort(DEFAULT_SORT);
                  setPage(1);
                  const input = document.querySelector('.toolbar__search-input');
                  if (input) input.value = '';
                }}
              >
                Clear
              </button>
            )}
          </div>

          {!clientLoading && !clientError && clients.length > 0 && (
            <div className="table-wrap">
              <table className="data-table client-table" aria-label="Clients">
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Contact Number</th>
                    <th scope="col">Bookings</th>
                    <th scope="col">Total Paid</th>
                    <th scope="col">Last Booking</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr className="data-row" key={client.id}>
                      <td className="client-table__client">
                        <strong className="client-table__name">{client.name}</strong>
                        <span className="client-table__email">{client.email}</span>
                        {client.hasOngoingWorkshop && <span className="tag tag--workshop">Workshop student</span>}
                      </td>
                      <td>{client.contactNumber || NOT_AVAILABLE}</td>
                      <td className="client-table__bookings">
                        <strong className="client-table__total">{client.totalBookings}</strong>
                        <span className="client-table__completed">
                          {client.totalBookings > 0 ? `${client.completedBookings} completed` : 'No bookings yet'}
                        </span>
                      </td>
                      <td className="client-table__paid">{formatPeso(client.totalPaid)}</td>
                      <td>{formatDate(client.lastBookingDate)}</td>
                      <td><button className="btn btn--sm" type="button" onClick={() => void openClientProfile(client.id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(clientLoading || clientError || isEmptyClients) && (
            <p className="status-message list-status" role={clientError ? 'alert' : 'status'}>
              {clientLoading
                ? 'Loading clients…'
                : clientError
                  || (search ? 'No clients match your search.' : 'No registered clients yet.')}
            </p>
          )}

          {!clientLoading && !clientError && total > pageSize && (
            <footer className="list-pagination">
              <p className="list-pagination__summary">Showing {first}–{last} of {total} clients</p>
              <div className="list-pagination__buttons">
                <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                <button className="btn" type="button" disabled={last >= total} onClick={() => setPage((value) => value + 1)}>Next</button>
              </div>
            </footer>
          )}
        </section>

        <section className="tab-panel" id="studentsPanel" role="tabpanel" aria-labelledby="studentsTab" hidden={activeTab !== 'students'}>
          <div className="summary-cards" aria-label="Workshop summary">
            {[
              ['Ongoing Workshops', students.length],
              ['Workshop Only', workshopOnly],
              ['With Other Services', students.length - workshopOnly],
            ].map(([label, value]) => (
              <article className="panel summary-card" key={label}>
                <h2 className="summary-card__label">{label}</h2>
                <p className="summary-card__value">{studentLoading ? '—' : value}</p>
              </article>
            ))}
          </div>

          <div className="panel toolbar">
            <label className="toolbar__search">
              <span className="visually-hidden">Search workshop students</span>
              <span className="toolbar__search-icon" aria-hidden="true"></span>
              <input
                className="field__input toolbar__search-input"
                type="search"
                placeholder="Search student or booking ID"
                autoComplete="off"
                maxLength="100"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
              />
            </label>
          </div>

          {!studentLoading && !studentError && visibleStudents.length > 0 && (
            <div className="table-wrap">
              <table className="data-table student-table" aria-label="Ongoing modeling workshops">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Services</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStudents.map((student) => {
                    const percent = student.totalAmount > 0 ? Math.min(100, (student.amountPaid / student.totalAmount) * 100) : 0;
                    return (
                      <tr className="data-row" key={student.bookingId}>
                        <td className="student-table__student">
                          <strong className="student-table__name">{student.customerName}</strong>
                          <span className="student-table__reference">#{student.reference}</span>
                        </td>
                        <td className="student-table__services">
                          <span>{student.services.join(', ')}</span>
                          {!student.canReschedule && <span className="tag tag--bundled">With other services</span>}
                        </td>
                        <td className="student-table__schedule">
                          <span className="student-table__date">{formatDate(student.eventDate)}</span>
                          <span className="student-table__time">{student.timeLabel}</span>
                        </td>
                        <td className="student-table__payment">
                          <span className="student-table__amounts">{formatPeso(student.amountPaid)} / {formatPeso(student.totalAmount)}</span>
                          <div className="progress"><div className="progress__bar" style={{ '--percent': `${percent}%` }}></div></div>
                          <span className="student-table__payment-label">{student.paymentLabel}</span>
                        </td>
                        <td><span className={`pill pill--${statusSlug(student.status)}`}>{student.status}</span></td>
                        <td>
                          <div className="row-actions row-actions--center">
                            <button
                              className="btn btn--sm btn--primary"
                              type="button"
                              disabled={!student.canReschedule}
                              title={student.canReschedule ? undefined : student.rescheduleBlockedReason}
                              onClick={() => openReschedule(student)}
                            >
                              Reschedule
                            </button>
                            <button className="btn btn--sm" type="button" onClick={() => void openStudentProfile(student)}>View</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(studentLoading || studentError || (!studentLoading && !studentError && visibleStudents.length === 0)) && (
            <p className="status-message list-status" role={studentError ? 'alert' : 'status'}>
              {studentLoading
                ? 'Loading workshop students…'
                : studentError
                  || (students.length === 0
                    ? 'No ongoing modeling workshops. Finished workshops are listed under Clients.'
                    : 'No students match your search.')}
            </p>
          )}
        </section>
      </main>

      <Dialog open={profileOpen} dialogRef={clientDialogRef} className="dialog--profile" labelledBy="clientDialogName" onClose={() => setProfileOpen(false)}>
        {profile && (
          <div className="dialog__form">
            <header className="dialog__header">
              <div>
                <p className="dialog__eyebrow">Client</p>
                <h2 className="dialog__title" id="clientDialogName">{profile.client.name}</h2>
              </div>
            </header>
            <DetailList items={[
              ['Email', profile.client.email],
              ['Contact number', profile.client.contactNumber || NOT_AVAILABLE],
            ]} />
            <div className="profile-stats">
              {[
                ['Bookings', profile.stats.totalBookings],
                ['Completed', profile.stats.completedBookings],
                ['Total paid', formatPeso(profile.stats.totalPaid)],
              ].map(([label, value]) => (
                <div className="profile-stat" key={label}>
                  <p className="profile-stat__label">{label}</p>
                  <p className="profile-stat__value">{value}</p>
                </div>
              ))}
            </div>
            <section>
              <h3 className="dialog__section-title">Booking history</h3>
              {profile.bookings.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table history-table" aria-label="Booking history">
                    <thead><tr><th>Booking ID</th><th>Services</th><th>Date</th><th>Status</th><th>Paid</th></tr></thead>
                    <tbody>
                      {profile.bookings.map((booking) => (
                        <tr key={booking.id ?? booking.reference}>
                          <td>#{booking.reference}</td>
                          <td>{booking.services.join(', ')}</td>
                          <td>{formatDate(booking.eventDate)}</td>
                          <td><span className={`pill pill--${statusSlug(booking.status)}`}>{booking.status}</span></td>
                          <td>{formatPeso(booking.amountPaid)} / {formatPeso(booking.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="status-message">This client has no bookings yet.</p>}
            </section>
            <div className="dialog__actions">
              <button className="btn" type="button" onClick={() => setProfileOpen(false)}>Close</button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={studentProfileOpen} dialogRef={studentDialogRef} className="dialog--profile" labelledBy="studentDialogName" onClose={() => setStudentProfileOpen(false)}>
        {studentProfile && (
          <div className="dialog__form">
            <header className="dialog__header">
              <div>
                <p className="dialog__eyebrow">Booking ID: #{studentProfile.booking.reference}</p>
                <h2 className="dialog__title" id="studentDialogName">{studentProfile.booking.customer.name}</h2>
              </div>
              <span className={`pill pill--${statusSlug(studentProfile.booking.status)}`}>{studentProfile.booking.status}</span>
            </header>
            <div className="profile-grid">
              <section>
                <h3 className="dialog__section-title">Student</h3>
                <DetailList items={[
                  ['Email', studentProfile.booking.customer.email],
                  ['Contact number', studentProfile.booking.customer.contactNumber || 'Not provided'],
                ]} />
              </section>
              <section>
                <h3 className="dialog__section-title">Schedule</h3>
                <DetailList items={[
                  ['Date', formatLongDate(studentProfile.booking.eventDate)],
                  ['Time', studentProfile.booking.timeLabel],
                  ['Venue', studentProfile.booking.eventAddress || 'Not provided'],
                ]} />
              </section>
            </div>
            <section>
              <h3 className="dialog__section-title">Services and payment</h3>
              <DetailList items={[
                ['Services', studentProfile.booking.services.map((service) => service.name).join(', ')],
                ['Total', formatPeso(studentProfile.booking.totalAmount)],
                ['Paid', formatPeso(studentProfile.booking.amountPaid)],
                ['Balance', formatPeso(studentProfile.booking.balance)],
                ['Payment status', studentProfile.booking.paymentLabel],
              ]} />
            </section>
            {!studentProfile.student.canReschedule && (
              <p className="alert alert--warning">{studentProfile.student.rescheduleBlockedReason}</p>
            )}
            <div className="dialog__actions">
              <button className="btn" type="button" onClick={() => setStudentProfileOpen(false)}>Close</button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={rescheduleOpen} dialogRef={rescheduleDialogRef} labelledBy="rescheduleTitle" onClose={() => { if (!saving) setRescheduleOpen(false); }}>
        {rescheduleStudent && (
          <form className="dialog__form" noValidate onSubmit={submitReschedule}>
            <header>
              <p className="dialog__eyebrow">Booking ID: #{rescheduleStudent.reference}</p>
              <h2 className="dialog__title" id="rescheduleTitle">Reschedule workshop</h2>
            </header>
            <p className="dialog__text">
              {rescheduleStudent.customerName} is currently scheduled for the full day on {formatLongDate(rescheduleStudent.eventDate)}.
            </p>
            <div className="field">
              <label className="field__label" htmlFor="rescheduleDate">New date</label>
              <input
                className="field__input"
                id="rescheduleDate"
                name="eventDate"
                type="date"
                required
                min={todayIso()}
                value={rescheduleDate}
                onChange={(event) => { setRescheduleDate(event.target.value); setFieldError(''); setRescheduleError(''); }}
              />
              {fieldError && <p className="field__error">{fieldError}</p>}
            </div>
            {rescheduleError && <p className="alert alert--error" role="alert">{rescheduleError}</p>}
            <div className="dialog__actions">
              <button className="btn" type="button" disabled={saving} onClick={() => setRescheduleOpen(false)}>Cancel</button>
              <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save new schedule'}</button>
            </div>
          </form>
        )}
      </Dialog>

      {toast && (
        <p className={`toast${toast.type === 'error' ? ' toast--error' : ''}`} role="status">
          {toast.message}
        </p>
      )}
    </AdminLayout>
  );
}
