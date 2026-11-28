import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AccountLayout from '../components/AccountLayout.jsx';
import { getJson, postJson } from '../lib/api.js';

const STATUSES = ['', 'Pending', 'To Pay', 'For Verification', 'Confirmed', 'Completed', 'Rejected'];
const INCOMING_STATUSES = new Set(['Pending', 'To Pay', 'For Verification', 'Confirmed']);
const API_BASE = '/api/customer';

function formatPeso(amount) {
  const value = Number(amount);
  const digits = Number.isInteger(value) ? 0 : 2;
  return `₱ ${value.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function formatDate(value, locale = 'en-US') {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function statusSlug(status) {
  return ({
    Pending: 'pending',
    'To Pay': 'topay',
    'For Verification': 'verification',
    Confirmed: 'confirmed',
    Completed: 'completed',
    Rejected: 'rejected',
  }[status] || 'pending');
}

function serviceNames(services) {
  return Array.isArray(services) ? services.map((service) => (
    typeof service === 'string' ? service : service.name
  )).filter(Boolean) : [];
}

function serviceDescription(services) {
  const descriptions = {
    'Hair & Makeup': 'Polished hair and makeup for your moment in the spotlight',
    Photography: 'Portrait, event and editorial sessions with professional retouching.',
    'Modeling Workshop': 'Hands-on posing, walking and confidence sessions for new talent.',
    'Pageant Training and Styling': 'Complete pageant coaching and styling.',
    'Event Coordination': 'Professional event coordination services.',
    'Event Planning': 'Comprehensive event planning and design.',
  };
  return descriptions[serviceNames(services)[0]] ?? '';
}

function ReschedulePicker({ booking, onSubmitted }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [blockedDates, setBlockedDates] = useState([]);
  const [bookedDates, setBookedDates] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotStatus, setSlotStatus] = useState('Choose a date to see available slots.');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [durationHours, setDurationHours] = useState(0);
  const availabilityRequest = useRef(0);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => index + 1);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  useEffect(() => {
    let cancelled = false;
    getJson(`/api/calendar/month?month=${monthKey}`).then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok || !Array.isArray(data.blockedDates) || !Array.isArray(data.bookedDates)) {
        throw new Error('Unavailable dates could not be loaded.');
      }
      setBlockedDates(data.blockedDates);
      setBookedDates(data.bookedDates);
      setCalendarStatus('');
    }).catch(() => {
      if (!cancelled) setCalendarStatus('Unavailable dates could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [monthKey]);

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    const request = ++availabilityRequest.current;
    setSlots([]);
    setSelectedSlot(null);
    setSlotStatus('Checking available slots...');
    getJson(`${API_BASE}/bookings/${booking.id}/reschedule-availability?date=${encodeURIComponent(date)}`)
      .then(({ ok, data }) => {
        if (cancelled || request !== availabilityRequest.current) return;
        if (!ok) throw new Error(data.message || 'Could not load available slots.');
        setSlots(data.slots ?? []);
        setDurationHours(data.durationHours ?? 0);
        setSlotStatus(data.slots?.length
          ? `Available slots for ${data.durationHours} hour${data.durationHours === 1 ? '' : 's'}:`
          : 'No time slots are available on this date. Please choose another date.');
      })
      .catch((availabilityError) => {
        if (!cancelled && request === availabilityRequest.current) {
          setSlotStatus(availabilityError.message || 'Unable to load available slots.');
        }
      });
    return () => { cancelled = true; };
  }, [booking.id, date]);

  async function submit() {
    setError('');
    if (!date) {
      setError('Please choose a new date.');
      return;
    }
    if (!selectedSlot) {
      setError('Choose an available time slot.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await postJson(`${API_BASE}/bookings/${booking.id}/reschedule`, {
        newDate: date,
        newStartTime: selectedSlot.startTime,
      });
      if (!response.ok) {
        setError(response.data.errors?.newDate || response.data.errors?.newStartTime || response.data.message || 'Could not submit request.');
        return;
      }
      await onSubmitted();
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="detail__reschedule" aria-label="Reschedule booking">
      <h3 className="detail__reschedule-title">Reschedule Date</h3>
      <div className="calendar">
        <div className="calendar__header">
          <button className="calendar__nav calendar__nav--prev" type="button" aria-label="Previous month" disabled={monthKey === todayIso.slice(0, 7)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}></button>
          <p className="calendar__month" aria-live="polite">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          <button className="calendar__nav calendar__nav--next" type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}></button>
        </div>
        <div className="calendar__weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar__days">
          {Array.from({ length: firstDay }, (_, index) => <span key={`empty-${index}`} />)}
          {days.map((day) => {
            const iso = `${monthKey}-${String(day).padStart(2, '0')}`;
            const past = iso < todayIso;
            const blocked = blockedDates.includes(iso);
            const booked = bookedDates.includes(iso);
            return (
              <button
                className={['calendar__day', past && 'is-past', blocked && 'is-blocked', booked && 'is-booked', date === iso && 'is-selected'].filter(Boolean).join(' ')}
                type="button"
                key={iso}
                disabled={past || blocked}
                aria-pressed={date === iso}
                onClick={() => { setDate(iso); setError(''); }}
              >
                {day}
              </button>
            );
          })}
        </div>
        {calendarStatus && <p className="calendar__status" role="status">{calendarStatus}</p>}
      </div>
      <div className="detail__reschedule-time">
        <p className="detail__reschedule-slot-status" role="status">{slotStatus}</p>
        <div className="detail__reschedule-slots" role="group" aria-label="Available reschedule time slots">
          {slots.map((slot) => (
            <button className={`detail__reschedule-slot${selectedSlot?.startTime === slot.startTime ? ' detail__reschedule-slot--selected' : ''}`} type="button" key={slot.startTime} aria-pressed={selectedSlot?.startTime === slot.startTime} onClick={() => setSelectedSlot(slot)}>{slot.label}</button>
          ))}
        </div>
      </div>
      {error && <p className="form-alert form-alert--error detail__alert" role="alert">{error}</p>}
      <div className="detail__reschedule-actions">
        <button className="btn-primary" type="button" disabled={submitting || !date || !selectedSlot || durationHours === 0} onClick={submit}>
          {submitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </section>
  );
}

export default function MyBookingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [activeStatus, setActiveStatus] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [bookingId, setBookingId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [initialView, setInitialView] = useState('details');
  const [viewMode, setViewMode] = useState('details');
  const [detailError, setDetailError] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentPending, setPaymentPending] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [voucher, setVoucher] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [voucherPending, setVoucherPending] = useState(false);
  const [gcashPending, setGcashPending] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleKey, setRescheduleKey] = useState(0);
  const fileInput = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/auth/me').then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok || !data?.customer) {
        navigate('/customer/html/login.html', { replace: true });
        return;
      }
      setCustomer(data.customer);
      setAuthenticated(true);
    }).catch(() => {
      if (!cancelled) navigate('/customer/html/login.html', { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (!authenticated) return undefined;
    let cancelled = false;
    setLoading(true);
    setListError('');
    const url = activeStatus
      ? `${API_BASE}/bookings?status=${encodeURIComponent(activeStatus)}`
      : `${API_BASE}/bookings`;
    getJson(url).then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok) {
        setBookings([]);
        setListError(data.message || 'Could not load your bookings. Please try again.');
        return;
      }
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
    }).catch(() => {
      if (!cancelled) {
        setBookings([]);
        setListError('Unable to reach the server. Please check your connection.');
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeStatus, authenticated]);

  useEffect(() => {
    if (!proofFile) {
      setProofPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  useEffect(() => {
    if (!bookingId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeDetail();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [bookingId]);

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const sortedBookings = useMemo(() => {
    const incoming = bookings.filter((booking) => INCOMING_STATUSES.has(booking.status) && booking.eventDate >= todayIso)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || Number(a.id) - Number(b.id));
    const rest = bookings.filter((booking) => !incoming.includes(booking));
    return { incoming, rest };
  }, [bookings, todayIso]);

  async function refreshBookings(status = activeStatus) {
    const url = status ? `${API_BASE}/bookings?status=${encodeURIComponent(status)}` : `${API_BASE}/bookings`;
    const response = await getJson(url);
    if (!response.ok) throw new Error(response.data.message || 'Could not reload your bookings.');
    setBookings(Array.isArray(response.data.bookings) ? response.data.bookings : []);
  }

  async function loadDetail(id) {
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await getJson(`${API_BASE}/bookings/${id}`);
      if (!response.ok || !response.data?.booking) {
        throw new Error(response.data?.message || 'Could not load booking details.');
      }
      const booking = response.data.booking;
      setDetail(booking);
      setVoucher(booking.voucherCode || '');
      return booking;
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Unable to reach the server.');
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  function openDetail(id, mode = 'details') {
    setBookingId(id);
    setInitialView(mode);
    setViewMode(mode);
    setDetail(null);
    setDetailError('');
    setPaymentMessage('');
    setPaymentError('');
    setProofFile(null);
    setVoucherError('');
    setShowReschedule(false);
    void loadDetail(id);
  }

  function closeDetail() {
    setBookingId(null);
    setDetail(null);
    setProofFile(null);
    setShowReschedule(false);
  }

  async function applyVoucher() {
    if (!detail || !voucher.trim()) {
      setVoucherError('Enter a voucher code.');
      return;
    }
    setVoucherPending(true);
    setVoucherError('');
    try {
      const response = await postJson(`${API_BASE}/bookings/${detail.id}/voucher`, { voucherCode: voucher });
      if (!response.ok) {
        setVoucherError(response.data.errors?.voucherCode || response.data.message || 'Could not apply voucher.');
        return;
      }
      await loadDetail(detail.id);
    } catch {
      setVoucherError('Unable to reach the server.');
    } finally {
      setVoucherPending(false);
    }
  }

  async function submitPayment() {
    if (!proofFile) {
      setPaymentError('Please upload a screenshot of your payment.');
      return;
    }
    setPaymentPending(true);
    setPaymentError('');
    const formData = new FormData();
    formData.append('proof', proofFile);
    try {
      const response = await fetch(`${API_BASE}/bookings/${detail.id}/payment`, { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPaymentError(data.errors?.proof || data.message || 'Could not submit payment.');
        return;
      }
      setPaymentMessage('Payment submitted. Waiting for studio verification.');
      setProofFile(null);
      setDetail((current) => ({ ...current, status: 'For Verification', pendingPaymentReview: true }));
      setActiveStatus('For Verification');
    } catch {
      setPaymentError('Unable to reach the server.');
    } finally {
      setPaymentPending(false);
    }
  }

  async function payWithGCash() {
    setGcashPending(true);
    setPaymentError('');
    try {
      const response = await postJson(`${API_BASE}/bookings/${detail.id}/gcash`, {});
      if (response.ok && response.data?.checkoutUrl) {
        window.location.assign(response.data.checkoutUrl);
        return;
      }
      setPaymentError(response.data.message || 'Could not start GCash payment. Please try again.');
    } catch {
      setPaymentError('Unable to reach the server. Please check your connection.');
    } finally {
      setGcashPending(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get('gcash');
    const id = Number(params.get('booking'));
    const paymentId = params.get('payment');
    if (result !== 'returned' || !Number.isInteger(id) || id < 1) return;
    navigate(location.pathname, { replace: true });
    async function showReturn() {
      const booking = await loadDetail(id);
      setBookingId(id);
      setInitialView('details');
      setViewMode('details');
      const payment = booking?.payments?.find((entry) => String(entry.id) === paymentId);
      if (payment?.status === 'Verified') {
        setPaymentMessage('NetCorePay confirmed your GCash payment.');
      } else if (payment?.status === 'Rejected') {
        setPaymentError('The GCash payment was not completed. You can try again.');
      } else {
        setPaymentMessage('Checkout returned. Waiting for NetCorePay payment confirmation; refresh this booking shortly.');
      }
    }
    void showReturn();
  }, [location.pathname, location.search, navigate]);

  function renderCard(booking) {
    const names = serviceNames(booking.services);
    const over = ['Completed', 'Rejected'].includes(booking.status);
    return (
      <li className="booking-card" key={booking.id}>
        <div className="booking-card__header">
          <span className="booking-card__ref">BRB - {booking.reference}</span>
          <span className="booking-card__badge">{booking.status}</span>
        </div>
        <div className="booking-card__body">
          {booking.imageUrl && (
            <div className="booking-card__media">
              <img className="booking-card__image" src={booking.imageUrl} alt={names.join(' + ')} />
            </div>
          )}
          <div className="booking-card__info">
            <p className="booking-card__services">{names.join(' + ') || '—'}</p>
            <p className="booking-card__description">{serviceDescription(booking.services)}</p>
            <p className="booking-card__price">{formatPeso(booking.totalAmount)}</p>
            <p className="booking-card__date">{formatDate(booking.eventDate)}</p>
            <p className="booking-card__time">{booking.timeLabel}</p>
          </div>
        </div>
        <div className="booking-card__actions">
          {booking.status === 'To Pay' && <button className="booking-card__btn booking-card__btn--solid" type="button" onClick={() => openDetail(booking.id, 'payment')}>Pay</button>}
          {booking.status === 'Confirmed' && <button className="booking-card__btn booking-card__btn--solid" type="button" onClick={() => openDetail(booking.id)}>View Details</button>}
          {over && <Link className="booking-card__btn booking-card__btn--outline" to="/customer/html/book-service.html">Book Again</Link>}
          {['Confirmed', 'Completed'].includes(booking.status) && <a className="booking-card__btn booking-card__btn--outline" href={`/customer/html/contract.html?id=${booking.id}`} target="_blank" rel="noopener noreferrer">Contract</a>}
          {['Pending', 'For Verification'].includes(booking.status) && (
            <p className="booking-card__waiting">
              {booking.status === 'For Verification' ? 'Downpayment submitted — awaiting verification...' : 'Waiting for studio approval...'}
            </p>
          )}
        </div>
      </li>
    );
  }

  const canPay = detail && ['To Pay', 'Confirmed'].includes(detail.status) && detail.balance > 0;
  const isPaymentOnly = initialView === 'payment' && detail?.status === 'To Pay' && viewMode === 'payment';
  const isDetailsOnly = initialView === 'payment' && detail?.status === 'To Pay' && viewMode === 'details';
  const due = detail?.status === 'To Pay'
    ? Math.max(detail.requiredDownpayment - detail.amountPaid, 0)
    : detail?.balance ?? 0;
  const statusLabel = detail?.pendingPaymentReview || detail?.status === 'For Verification'
    ? 'Downpayment Awaiting Verification'
    : ({
      Pending: 'Waiting for Studio Approval',
      'To Pay': 'Approved — Awaiting Downpayment',
      Confirmed: 'Confirmed',
      Completed: 'Completed',
      Rejected: 'Rejected',
    }[detail?.status] || detail?.status);

  return (
    <AccountLayout activePage="my-bookings" customer={customer} title="My Bookings | BRB Studios">
      <h1 className="bookings-page__title">My Bookings</h1>
      <div className="status-tabs" role="tablist" aria-label="Filter by status">
        {STATUSES.map((status) => (
          <button
            className={`status-tab${activeStatus === status ? ' status-tab--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeStatus === status}
            key={status || 'all'}
            onClick={() => setActiveStatus(status)}
          >
            {status || 'All Statuses'}
          </button>
        ))}
      </div>

      {loading && <p className="bookings-page__status" role="status">Loading your bookings...</p>}
      {!loading && listError && <p className="bookings-page__status" role="alert">{listError}</p>}
      {!loading && !listError && bookings.length === 0 && <p className="bookings-page__status" role="status">No bookings found.</p>}

      {!loading && !listError && bookings.length > 0 && (
        <ul className="booking-cards">
          {sortedBookings.incoming.length > 0 && (
            <>
              <li className="booking-cards__group booking-cards__group--incoming">Incoming Bookings</li>
              {activeStatus ? sortedBookings.incoming.map(renderCard) : sortedBookings.incoming.map(renderCard)}
            </>
          )}
          {activeStatus
            ? sortedBookings.rest.map(renderCard)
            : [...new Set(sortedBookings.rest.map((booking) => booking.status))].flatMap((status) => [
              <li className="booking-cards__group" key={`group-${status}`}>{status}</li>,
              ...sortedBookings.rest.filter((booking) => booking.status === status).map(renderCard),
            ])}
        </ul>
      )}

      {bookingId && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail(); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="detailTitle">
            <button className="modal__close" type="button" aria-label="Close" onClick={closeDetail}></button>
            <div className="modal__body">
              {detailLoading && <p role="status">Loading booking details...</p>}
              {!detailLoading && detailError && <p className="form-alert form-alert--error" role="alert">{detailError}</p>}
              {!detailLoading && detail && (
                <div className={`detail${isPaymentOnly ? ' detail--payment-only' : ''}${isDetailsOnly ? ' detail--details-only' : ''}`}>
                  <h2 className="detail__ref" id="detailTitle">BOOKING SUMMARY : BRB - {detail.reference}</h2>
                  <div className={`detail__status-banner detail__status-banner--${statusSlug(detail.status)}`}>Your Order is {statusLabel}</div>
                  {paymentMessage && !canPay && <p className="form-alert form-alert--success detail__alert" role="status">{paymentMessage}</p>}
                  {paymentError && !canPay && <p className="form-alert form-alert--error detail__alert" role="alert">{paymentError}</p>}
                  <section className="detail__summary">
                    <h3 className="detail__summary-title">Booking Info</h3>
                    <div className="detail__row"><span className="detail__label">Services:</span><span>{detail.services?.map((service) => <span key={service.name}>{service.name}<br /></span>)}</span></div>
                    <div className="detail__row"><span className="detail__label">Date:</span><span>{formatDate(detail.eventDate)}</span></div>
                    <div className="detail__row"><span className="detail__label">Time:</span><span>{formatTime(detail.startTime)} - {formatTime(detail.endTime)}</span></div>
                    <div className="detail__row"><span className="detail__label">Subtotal:</span><span>{formatPeso(detail.subtotal)}</span></div>
                    {detail.voucherCode && <div className="detail__row"><span className="detail__label">Voucher:</span><span>{detail.voucherCode} (−{formatPeso(detail.discountAmount)})</span></div>}
                    {!detail.voucherCode && detail.status === 'To Pay' && (
                      <div className="detail__row">
                        <span className="detail__label">Voucher:</span>
                        <div className="detail__voucher">
                          <input className="detail__voucher-input" value={voucher} onChange={(event) => setVoucher(event.target.value)} placeholder="Enter code" maxLength={30} />
                          <button className="detail__voucher-btn" type="button" disabled={voucherPending} onClick={applyVoucher}>{voucherPending ? 'Applying...' : 'Apply'}</button>
                        </div>
                      </div>
                    )}
                    {voucherError && <p className="form-alert form-alert--error detail__alert" role="alert">{voucherError}</p>}
                    <div className="detail__row"><span className="detail__label">Total:</span><span>{formatPeso(detail.totalAmount)}</span></div>
                    {canPay && <div className="detail__row"><span className="detail__label">50% Downpayment:</span><span className="detail__downpayment">{formatPeso(detail.requiredDownpayment)}</span></div>}
                  </section>

                  {canPay && (
                    <section className="detail__payment-panel">
                      <p className="detail__payment-due"><span>{detail.status === 'To Pay' ? 'Downpayment due' : 'Remaining balance'}</span><strong>{formatPeso(due)}</strong></p>
                      {paymentMessage && <p className="form-alert form-alert--success detail__alert" role="status">{paymentMessage}</p>}
                      {paymentError && <p className="form-alert form-alert--error detail__alert" role="alert">{paymentError}</p>}
                      <p className="detail__proof-label">Pay via GCash through NetCorePay. Payment is verified automatically.</p>
                      <button className="detail__gcash-btn" type="button" disabled={gcashPending} onClick={payWithGCash}>{gcashPending ? 'Opening NetCorePay...' : 'Pay with GCash'}</button>
                      <div className="detail__divider"><span>or upload proof manually</span></div>
                      <div className="detail__proof-upload">
                        <p className="detail__proof-label">Proof of payment (screenshot):</p>
                        <label className={`detail__proof-drop${proofFile ? ' has-file' : ''}`}>
                          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload payment screenshot" onChange={(event) => setProofFile(event.target.files?.[0] || null)} />
                          <span className="detail__proof-icon" aria-hidden="true"></span>
                          <span className="detail__proof-text">{proofFile?.name || 'Upload screenshot of your payment'}</span>
                        </label>
                        {proofPreview && (
                          <div className="detail__proof-preview">
                            <img src={proofPreview} alt="Preview of selected payment proof" />
                            <button className="detail__proof-cancel" type="button" onClick={() => { setProofFile(null); if (fileInput.current) fileInput.current.value = ''; }}>Cancel</button>
                          </div>
                        )}
                      </div>
                      <button className="detail__submit-btn" type="button" disabled={paymentPending} onClick={submitPayment}>{paymentPending ? 'Submitting...' : 'Submit Manual Proof'}</button>
                    </section>
                  )}

                  {detail.payments?.length > 0 && (
                    <section className="payment-history">
                      <h3 className="payment-history__title">Payment History</h3>
                      <ul className="payment-history__list">
                        {detail.payments.map((payment) => (
                          <li className="payment-history__item" key={payment.id}>
                            <div className="payment-history__item-left">
                              <span className="payment-history__type">{payment.type} — {formatPeso(payment.amount)}</span>
                              <span className="payment-history__meta">{payment.method} · {payment.submittedAt?.slice(0, 10)}</span>
                              {payment.rejectReason && <span className="payment-history__meta">Reason: {payment.rejectReason}</span>}
                            </div>
                            <span className={`payment-history__status${payment.status === 'Pending' ? ' payment-history__status--pending' : payment.status === 'Rejected' ? ' payment-history__status--rejected' : ''}`}>{payment.status}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {detail.rescheduleRequest && (
                    <div className={`detail__reschedule-notice detail__reschedule-notice--${detail.rescheduleRequest.status.toLowerCase()}`}>
                      <p className="detail__reschedule-notice-title">
                        {detail.rescheduleRequest.status === 'Pending' ? 'Reschedule request pending' : detail.rescheduleRequest.status === 'Approved' ? 'Reschedule request approved' : 'Reschedule request declined'}
                      </p>
                      <p>
                        {detail.rescheduleRequest.status === 'Rejected'
                          ? 'The owner could not move your booking. It keeps its current schedule.'
                          : `Your requested schedule: ${formatDate(detail.rescheduleRequest.newDate)}, ${formatTime(detail.rescheduleRequest.newStartTime)} - ${formatTime(detail.rescheduleRequest.newEndTime)}.`}
                      </p>
                    </div>
                  )}

                  {showReschedule && detail.canReschedule && (
                    <ReschedulePicker
                      key={`${detail.id}-${rescheduleKey}`}
                      booking={detail}
                      onSubmitted={async () => {
                        await refreshBookings();
                        await loadDetail(detail.id);
                        setShowReschedule(false);
                      }}
                    />
                  )}

                  <div className="detail__modal-actions">
                    {detail.canReschedule && <button className="booking-card__btn booking-card__btn--outline" id="rescheduleToggleBtn" type="button" onClick={() => { setShowReschedule((shown) => !shown); setRescheduleKey((key) => key + 1); }}>{detail.rescheduleRequest?.status === 'Pending' ? 'Change Reschedule Request' : 'Reschedule Booking'}</button>}
                    {initialView === 'payment' && detail.status === 'To Pay' && <button className="booking-card__btn booking-card__btn--outline" type="button" onClick={() => setViewMode(viewMode === 'payment' ? 'details' : 'payment')}>{viewMode === 'payment' ? 'View Details' : 'Back to Payment'}</button>}
                    <button className="booking-card__btn booking-card__btn--outline" type="button" onClick={closeDetail}>Close</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AccountLayout>
  );
}
