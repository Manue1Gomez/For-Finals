import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { getJson, sendJson } from '../lib/adminApi.js';

const WALK_IN_API = '/api/admin/walk-in';
const VOUCHER_API = '/api/admin/vouchers';
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function pad(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoDateForMonth(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function monthKey(year, month) {
  return `${year}-${pad(month + 1)}`;
}

function formatPeso(value) {
  const amount = Number(value);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return '—';
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${pad(minute)} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function FieldError({ children }) {
  return children
    ? <p className="field__error">{children}</p>
    : <p className="field__error" hidden></p>;
}

function AdminNewBookingPage() {
  const today = toIsoDate(new Date());
  const [step, setStep] = useState(1);
  const [customerType, setCustomerType] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [existingCustomer, setExistingCustomer] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupPending, setLookupPending] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    firstName: '',
    lastName: '',
    email: '',
    contactNumber: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [services, setServices] = useState([]);
  const [servicesStatus, setServicesStatus] = useState('Loading services...');
  const [servicesReady, setServicesReady] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [calendarData, setCalendarData] = useState(null);
  const [calendarStatus, setCalendarStatus] = useState('Loading calendar...');
  const [selectedDate, setSelectedDate] = useState('');
  const [availability, setAvailability] = useState({
    slots: [],
    wholeDay: false,
    available: false,
    durationHours: 0,
  });
  const [availabilityStatus, setAvailabilityStatus] = useState(
    'Choose services and a date to see available times.',
  );
  const [availabilityError, setAvailabilityError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingHoursNote, setBookingHoursNote] = useState('');
  const [eventAddress, setEventAddress] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherHint, setVoucherHint] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [voucherPending, setVoucherPending] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [markDownpayment, setMarkDownpayment] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const monthRequest = useRef(0);
  const availabilityRequest = useRef(0);

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(Number(service.id))),
    [services, selectedServiceIds],
  );
  const subtotal = selectedServices.reduce((sum, service) => sum + Number(service.price), 0);
  const discount = appliedVoucher ? Number(appliedVoucher.discountAmount) : 0;
  const total = Math.max(0, subtotal - discount);
  const requiredDownpayment = Math.ceil((total * 100) / 2) / 100;
  const selectedServiceKey = selectedServiceIds.join(',');

  useEffect(() => {
    if (step !== 3 || servicesReady) return undefined;
    let cancelled = false;
    setServicesStatus('Loading services...');
    getJson('/api/admin/services').then((result) => {
      if (cancelled) return;
      if (!Array.isArray(result)) throw new Error('The server returned an invalid services list.');
      const available = result.filter((service) =>
        service.availability === true ||
        service.availability === 1 ||
        service.availability === '1' ||
        service.available === true
      );
      setServices(available);
      setServicesReady(true);
      setServicesStatus(available.length ? '' : 'No services available.');
    }).catch((error) => {
      if (!cancelled) {
        setServicesStatus(error.message || 'Could not load services. Please refresh.');
      }
    });
    return () => { cancelled = true; };
  }, [step, servicesReady]);

  useEffect(() => {
    if (step !== 3) return undefined;
    let cancelled = false;
    const requestId = ++monthRequest.current;
    const currentMonth = monthKey(calendarMonth.year, calendarMonth.month);
    setCalendarData(null);
    setCalendarStatus('Loading calendar...');
    getJson(`/api/admin/calendar/month?month=${encodeURIComponent(currentMonth)}`)
      .then((result) => {
        if (cancelled || requestId !== monthRequest.current) return;
        if (!Array.isArray(result.bookedDates) || !Array.isArray(result.blockedDates)) {
          throw new Error('The server returned invalid calendar data.');
        }
        setCalendarData({
          bookedDates: new Set(result.bookedDates),
          blockedDates: new Set(result.blockedDates),
        });
        setCalendarStatus('');
      })
      .catch((error) => {
        if (!cancelled && requestId === monthRequest.current) {
          setCalendarStatus(error.message || 'Calendar data could not be loaded.');
        }
      });
    return () => { cancelled = true; };
  }, [step, calendarMonth]);

  useEffect(() => {
    if (step !== 3) return undefined;
    let cancelled = false;
    getJson('/api/calendar/hours').then((hours) => {
      if (cancelled) return;
      if (!hours?.open || !hours?.close) throw new Error('The server returned invalid studio hours.');
      setBookingHoursNote(`Studio hours: ${formatTime(hours.open)} - ${formatTime(hours.close)}.`);
    }).catch((error) => {
      if (!cancelled) setBookingHoursNote(error.message || 'Studio hours could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [step]);

  useEffect(() => {
    if (!selectedDate || selectedServiceIds.length === 0) {
      setAvailability({
        slots: [],
        wholeDay: false,
        available: false,
        durationHours: 0,
      });
      setSelectedSlot(null);
      setAvailabilityError('');
      setAvailabilityStatus('Choose services and a date to see available times.');
      return undefined;
    }

    let cancelled = false;
    const requestId = ++availabilityRequest.current;
    setAvailability({
      slots: [],
      wholeDay: false,
      available: false,
      durationHours: 0,
    });
    setSelectedSlot(null);
    setAvailabilityError('');
    setAvailabilityStatus('Checking available slots...');
    const query = new URLSearchParams({
      date: selectedDate,
      serviceIds: selectedServiceKey,
    });
    getJson(`/api/calendar/availability?${query}`)
      .then((result) => {
        if (cancelled || requestId !== availabilityRequest.current) return;
        if (!Array.isArray(result.slots)) throw new Error('The server returned invalid availability data.');
        const nextAvailability = {
          slots: result.slots,
          wholeDay: Boolean(result.wholeDay),
          available: Boolean(result.available),
          durationHours: Number(result.durationHours) || 0,
        };
        setAvailability(nextAvailability);
        if (nextAvailability.wholeDay) {
          setAvailabilityStatus(nextAvailability.available
            ? 'Modeling Workshop is a full-day booking. No time selection is needed.'
            : 'This date is unavailable for a Modeling Workshop.');
        } else if (nextAvailability.slots.length === 0) {
          setAvailabilityStatus('No time slots are available for the selected services on this date.');
        } else {
          setAvailabilityStatus(
            `Available slots for ${nextAvailability.durationHours} hour${nextAvailability.durationHours === 1 ? '' : 's'}:`,
          );
        }
      })
      .catch((error) => {
        if (!cancelled && requestId === availabilityRequest.current) {
          setAvailabilityError(error.message || 'Available slots could not be loaded.');
          setAvailabilityStatus('');
        }
      });
    return () => { cancelled = true; };
  }, [selectedDate, selectedServiceKey]);

  function chooseCustomerType(type) {
    setCustomerType(type);
    setLookupError('');
    setFieldErrors({});
    setExistingCustomer(null);
    if (type === 'existing') {
      setLookupEmail('');
      setStep(2);
    } else {
      setStep(2);
    }
  }

  async function lookupCustomer() {
    const email = lookupEmail.trim().toLowerCase();
    setLookupError('');
    setFieldErrors({});
    setExistingCustomer(null);
    if (!email) {
      setFieldErrors({ lookupEmail: 'Enter an email address.' });
      return;
    }

    setLookupPending(true);
    try {
      const result = await getJson(`/api/admin/clients/by-email?email=${encodeURIComponent(email)}`);
      if (!result?.id || !result.firstName || !result.lastName) {
        throw new Error('The server returned an invalid client record.');
      }
      setExistingCustomer(result);
    } catch (error) {
      setLookupError(error.status === 404
        ? 'No account found with that email address.'
        : error.message || 'Unable to look up this client.');
    } finally {
      setLookupPending(false);
    }
  }

  function updateNewCustomer(name, value) {
    setNewCustomer((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function toggleService(service) {
    const id = Number(service.id);
    const isSelected = selectedServiceIds.includes(id);
    const selected = services.filter((item) => selectedServiceIds.includes(Number(item.id)));
    const isWorkshop = (item) => /modeling workshop/i.test(item.name);
    const serviceIsWorkshop = isWorkshop(service);
    if (!isSelected && selected.some((item) => isWorkshop(item) !== serviceIsWorkshop)) return;

    setSelectedServiceIds(isSelected
      ? selectedServiceIds.filter((selectedId) => selectedId !== id)
      : [...selectedServiceIds, id]);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.serviceIds;
      delete next.startTime;
      return next;
    });
    setBookingError('');
    if (appliedVoucher) {
      setAppliedVoucher(null);
      setVoucherHint('Services changed. Apply the voucher again to refresh the discount.');
    }
    setVoucherError('');
  }

  function selectDate(date) {
    setSelectedDate(date);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.eventDate;
      delete next.startTime;
      return next;
    });
  }

  function changeMonth(amount) {
    setCalendarMonth((current) => {
      const next = new Date(current.year, current.month + amount, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  async function applyVoucher() {
    const code = voucherCode.trim().toUpperCase();
    setVoucherError('');
    setVoucherHint('');
    if (!code) {
      setVoucherError('Enter a voucher code first.');
      return;
    }
    if (selectedServices.length === 0 || subtotal <= 0) {
      setVoucherError('Select at least one service before applying a voucher.');
      return;
    }

    setVoucherPending(true);
    try {
      const vouchers = await getJson(VOUCHER_API);
      if (!Array.isArray(vouchers)) throw new Error('The server returned an invalid voucher list.');
      const voucher = vouchers.find((item) => String(item.code).toUpperCase() === code);
      const remainingUses = Number(voucher?.remainingUses);
      if (
        !voucher ||
        voucher.expired ||
        voucher.startDate > today ||
        voucher.endDate < today ||
        !Number.isFinite(remainingUses) ||
        remainingUses <= 0
      ) {
        throw new Error('Voucher is invalid, expired, or has reached its usage limit.');
      }

      const subtotalCents = Math.round(subtotal * 100);
      const discountCents = voucher.discountType === 'Percentage'
        ? Math.round((subtotalCents * Number(voucher.discountValue)) / 100)
        : Math.round(Number(voucher.discountValue) * 100);
      const discountAmount = Math.min(discountCents, subtotalCents) / 100;
      setAppliedVoucher({
        voucherCode: code,
        voucherName: voucher.name,
        discountAmount,
      });
      setVoucherCode(code);
      setVoucherHint(`${voucher.name}: − ${formatPeso(discountAmount)} applied. The booking will revalidate this voucher.`);
    } catch (error) {
      setAppliedVoucher(null);
      setVoucherError(error.message || 'Unable to apply this voucher.');
    } finally {
      setVoucherPending(false);
    }
  }

  function continueToPayment() {
    setBookingError('');
    setFieldErrors({});
    let valid = true;
    const errors = {};
    if (selectedServiceIds.length === 0) {
      errors.serviceIds = 'Choose at least one service.';
      valid = false;
    }
    if (!selectedDate) {
      errors.eventDate = 'Choose an event date from the calendar.';
      valid = false;
    }
    if (availability.wholeDay && !availability.available) {
      errors.startTime = 'Choose an available date for the Modeling Workshop.';
      valid = false;
    } else if (!availability.wholeDay && !selectedSlot) {
      errors.startTime = 'Choose an available time slot.';
      valid = false;
    }
    if (voucherCode.trim() && !appliedVoucher) {
      setVoucherError('Apply the voucher before continuing so the total and downpayment are accurate.');
      valid = false;
    }
    setFieldErrors(errors);
    if (!valid) return;

    setPaymentAmount('');
    setMarkDownpayment(false);
    setPaymentError('');
    setStep(4);
  }

  function buildPayload() {
    const customer = customerType === 'new'
      ? {
        type: 'new',
        firstName: newCustomer.firstName.trim(),
        lastName: newCustomer.lastName.trim(),
        email: newCustomer.email.trim().toLowerCase(),
        contactNumber: newCustomer.contactNumber.replace(/[\s-]/g, ''),
        password: newCustomer.password,
      }
      : { type: 'existing', id: existingCustomer?.id };

    return {
      customer,
      booking: {
        serviceIds: selectedServiceIds,
        eventDate: selectedDate,
        ...(availability.wholeDay ? {} : { startTime: selectedSlot?.startTime }),
        eventAddress: eventAddress.trim() || null,
        voucherCode: appliedVoucher?.voucherCode || null,
      },
      payment: {
        method: paymentMethod,
        markFullyPaid: markDownpayment,
        amount: markDownpayment ? null : Number(paymentAmount),
        note: paymentNote.trim() || null,
      },
    };
  }

  function groupServerErrors(errors = {}) {
    const customerKeys = ['firstName', 'lastName', 'email', 'contactNumber', 'password'];
    const bookingKeys = ['serviceIds', 'eventDate', 'startTime', 'eventAddress', 'voucherCode'];
    const paymentKeys = ['method', 'amount'];
    const customerErrors = {};
    const bookingErrors = {};
    const paymentErrors = {};
    Object.entries(errors).forEach(([name, message]) => {
      if (customerKeys.includes(name)) customerErrors[name] = message;
      else if (bookingKeys.includes(name)) bookingErrors[name] = message;
      else if (paymentKeys.includes(name)) paymentErrors[name] = message;
    });
    return { customerErrors, bookingErrors, paymentErrors };
  }

  async function submitBooking() {
    setPaymentError('');
    setBookingError('');
    setFieldErrors({});
    const errors = {};
    if (!paymentMethod) errors.method = 'Choose a payment method.';
    if (!markDownpayment) {
      const amount = Number(paymentAmount);
      if (!paymentAmount || !Number.isFinite(amount) || amount <= 0) {
        errors.amount = 'Enter a valid amount greater than 0.';
      }
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await sendJson(WALK_IN_API, 'POST', buildPayload());
      if (!result?.reference) throw new Error('The server did not return a booking reference.');
      const customerName = customerType === 'new'
        ? `${newCustomer.firstName.trim()} ${newCustomer.lastName.trim()}`
        : `${existingCustomer?.firstName ?? ''} ${existingCustomer?.lastName ?? ''}`.trim();
      setSuccess({
        reference: result.reference,
        customerName,
        bookingStatus: result.bookingStatus || 'Confirmed',
      });
      setStep(5);
    } catch (error) {
      const grouped = groupServerErrors(error.fieldErrors);
      if (Object.keys(grouped.customerErrors).length) {
        setFieldErrors(grouped.customerErrors);
        setPaymentError(error.message || 'Please correct the client details.');
        setStep(2);
      } else if (Object.keys(grouped.bookingErrors).length) {
        setFieldErrors(grouped.bookingErrors);
        setBookingError(error.message || 'Please correct the booking details.');
        if (grouped.bookingErrors.voucherCode) {
          setVoucherError(grouped.bookingErrors.voucherCode);
          setAppliedVoucher(null);
        }
        setStep(3);
      } else {
        setFieldErrors(grouped.paymentErrors);
        setPaymentError(error.message || 'Unable to record the booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startAnotherBooking() {
    setStep(1);
    setCustomerType('');
    setLookupEmail('');
    setExistingCustomer(null);
    setLookupError('');
    setNewCustomer({
      firstName: '',
      lastName: '',
      email: '',
      contactNumber: '',
      password: '',
    });
    setFieldErrors({});
    setSelectedServiceIds([]);
    setSelectedDate('');
    setAvailability({
      slots: [],
      wholeDay: false,
      available: false,
      durationHours: 0,
    });
    setSelectedSlot(null);
    setEventAddress('');
    setVoucherCode('');
    setAppliedVoucher(null);
    setVoucherHint('');
    setVoucherError('');
    setBookingError('');
    setPaymentMethod('');
    setPaymentAmount('');
    setMarkDownpayment(false);
    setPaymentNote('');
    setPaymentError('');
    setSuccess(null);
  }

  const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const currentMonthIsToday = calendarMonth.year === new Date().getFullYear() &&
    calendarMonth.month === new Date().getMonth();
  const calendarCells = [
    ...Array.from({ length: firstDay }, (_, index) => ({ key: `blank-${index}`, blank: true })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = isoDateForMonth(calendarMonth.year, calendarMonth.month, day);
      return { key: date, date, day };
    }),
  ];
  const workshopSelected = selectedServices.some((service) => /modeling workshop/i.test(service.name));

  return (
    <AdminLayout
      activePage="bookings"
      title="New Booking | BRB Studios Admin"
    >
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Operations</p>
          <h1 className="page-header__title">New Walk-in Booking</h1>
          <p className="page-header__subtitle">Record a walk-in client&apos;s booking and downpayment in one go.</p>
        </header>

        <ol className="nb-steps" aria-label="Booking steps">
          {['Customer', 'Details', 'Booking', 'Payment'].map((label, index) => {
            const number = index + 1;
            const stateClass = step === number
              ? ' nb-step--active'
              : step > number
                ? ' nb-step--done'
                : '';
            return (
              <li className={`nb-step${stateClass}`} key={label}>
                <span className="nb-step__num">{number}</span>
                <span className="nb-step__label">{label}</span>
              </li>
            );
          })}
        </ol>

        <div className="nb-card panel">
          {step === 1 && (
            <section className="nb-panel" aria-labelledby="step1Title">
              <h2 className="nb-panel__title" id="step1Title">Is this a registered or new client?</h2>
              <p className="nb-panel__sub">Choose how to look up or create the client account.</p>
              <div className="nb-type-cards">
                <button className="nb-type-card" type="button" onClick={() => chooseCustomerType('existing')}>
                  <span className="nb-type-card__icon nb-type-card__icon--existing" aria-hidden="true"></span>
                  <strong>Registered client</strong>
                  <span>Look up an existing account by email.</span>
                </button>
                <button className="nb-type-card" type="button" onClick={() => chooseCustomerType('new')}>
                  <span className="nb-type-card__icon nb-type-card__icon--new" aria-hidden="true"></span>
                  <strong>New client</strong>
                  <span>Create an account as part of this booking.</span>
                </button>
              </div>
            </section>
          )}

          {step === 2 && customerType === 'existing' && (
            <section className="nb-panel" aria-labelledby="step2existingTitle">
              <h2 className="nb-panel__title" id="step2existingTitle">Find registered client</h2>
              <p className="nb-panel__sub">Enter the client&apos;s email address to pull up their account.</p>
              <div className="nb-form-body">
                {lookupError && <p className="alert alert--error" role="alert">{lookupError}</p>}
                <div className={`field${fieldErrors.lookupEmail ? ' field--invalid' : ''}`}>
                  <label className="field__label" htmlFor="lookupEmail">Email address</label>
                  <input
                    className="field__input"
                    id="lookupEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="e.g. client@email.com"
                    value={lookupEmail}
                    onChange={(event) => {
                      setLookupEmail(event.target.value);
                      setExistingCustomer(null);
                      setLookupError('');
                      setFieldErrors((current) => ({ ...current, lookupEmail: '' }));
                    }}
                  />
                  <FieldError>{fieldErrors.lookupEmail}</FieldError>
                </div>
                {existingCustomer && (
                  <div className="nb-found-customer panel">
                    <p className="nb-found-customer__name">
                      {existingCustomer.firstName} {existingCustomer.lastName}
                    </p>
                    <p className="nb-found-customer__meta">
                      {existingCustomer.email} · {existingCustomer.contactNumber}
                    </p>
                  </div>
                )}
              </div>
              <div className="nb-nav">
                <button className="btn" type="button" onClick={() => setStep(1)}>← Back</button>
                {!existingCustomer && (
                  <button className="btn btn--primary" type="button" disabled={lookupPending} onClick={() => void lookupCustomer()}>
                    {lookupPending ? 'Looking up…' : 'Look up'}
                  </button>
                )}
                {existingCustomer && (
                  <button className="btn btn--primary" type="button" onClick={() => setStep(3)}>
                    Continue →
                  </button>
                )}
              </div>
            </section>
          )}

          {step === 2 && customerType === 'new' && (
            <section className="nb-panel" aria-labelledby="step2newTitle">
              <h2 className="nb-panel__title" id="step2newTitle">New client details</h2>
              <p className="nb-panel__sub">This creates their account. They can log in later with this email and password.</p>
              {paymentError && <p className="alert alert--error" role="alert">{paymentError}</p>}
              <div className="nb-form-body">
                <div className="field-row-2">
                  {[
                    ['firstName', 'First name', 'given-name'],
                    ['lastName', 'Last name', 'family-name'],
                  ].map(([name, label, autocomplete]) => (
                    <div className={`field${fieldErrors[name] ? ' field--invalid' : ''}`} key={name}>
                      <label className="field__label" htmlFor={`new${label.replace(' ', '')}`}>{label}</label>
                      <input
                        className="field__input"
                        id={`new${label.replace(' ', '')}`}
                        name={name}
                        type="text"
                        autoComplete={autocomplete}
                        value={newCustomer[name]}
                        onChange={(event) => updateNewCustomer(name, event.target.value)}
                      />
                      <FieldError>{fieldErrors[name]}</FieldError>
                    </div>
                  ))}
                </div>
                <div className={`field${fieldErrors.email ? ' field--invalid' : ''}`}>
                  <label className="field__label" htmlFor="newEmail">Email address</label>
                  <input
                    className="field__input"
                    id="newEmail"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={newCustomer.email}
                    onChange={(event) => updateNewCustomer('email', event.target.value)}
                  />
                  <FieldError>{fieldErrors.email}</FieldError>
                </div>
                <div className={`field${fieldErrors.contactNumber ? ' field--invalid' : ''}`}>
                  <label className="field__label" htmlFor="newContact">Contact number</label>
                  <input
                    className="field__input"
                    id="newContact"
                    name="contactNumber"
                    type="tel"
                    placeholder="09XXXXXXXXX"
                    maxLength="11"
                    value={newCustomer.contactNumber}
                    onChange={(event) => updateNewCustomer('contactNumber', event.target.value)}
                  />
                  <FieldError>{fieldErrors.contactNumber}</FieldError>
                </div>
                <div className={`field${fieldErrors.password ? ' field--invalid' : ''}`}>
                  <label className="field__label" htmlFor="newPassword">Temporary password</label>
                  <input
                    className="field__input"
                    id="newPassword"
                    name="password"
                    type="text"
                    autoComplete="off"
                    placeholder="Min. 8 characters, include a number"
                    value={newCustomer.password}
                    onChange={(event) => updateNewCustomer('password', event.target.value)}
                  />
                  <p className="field__hint">The client can change this after logging in.</p>
                  <FieldError>{fieldErrors.password}</FieldError>
                </div>
              </div>
              <div className="nb-nav">
                <button className="btn" type="button" onClick={() => setStep(1)}>← Back</button>
                <button className="btn btn--primary" type="button" onClick={() => {
                  setFieldErrors({});
                  setPaymentError('');
                  setStep(3);
                }}>
                  Continue →
                </button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="nb-panel" aria-labelledby="step3Title">
              <h2 className="nb-panel__title" id="step3Title">Booking details</h2>
              <p className="nb-panel__sub">Select the services and schedule for this booking.</p>
              {bookingError && <p className="alert alert--error" role="alert">{bookingError}</p>}
              <div className="nb-form-body">
                <div className="field">
                  <p className="field__label">Services</p>
                  <div className="nb-service-grid">
                    {services.map((service) => {
                      const id = Number(service.id);
                      const selected = selectedServiceIds.includes(id);
                      const serviceIsWorkshop = /modeling workshop/i.test(service.name);
                      const conflictingSelection = selectedServices.some(
                        (item) => /modeling workshop/i.test(item.name) !== serviceIsWorkshop,
                      );
                      const duration = service.durationHours === null || service.durationHours === undefined
                        ? 'Full day'
                        : `${service.durationHours} hour${Number(service.durationHours) === 1 ? '' : 's'}`;
                      return (
                        <button
                          className={`nb-service-card${selected ? ' nb-service-card--selected' : ''}`}
                          type="button"
                          key={service.id}
                          disabled={!selected && conflictingSelection}
                          onClick={() => toggleService(service)}
                        >
                          <span className="nb-service-card__name">{service.name}</span>
                          <span className="nb-service-card__price">{formatPeso(service.price)}</span>
                          <span className="nb-service-card__duration">{duration}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!servicesReady || servicesStatus ? (
                    <p className="status-message" role={servicesReady ? 'status' : 'status'}>
                      {servicesStatus || 'Loading services...'}
                    </p>
                  ) : null}
                  <FieldError>{fieldErrors.serviceIds}</FieldError>
                  {workshopSelected && (
                    <p className="field__hint">Modeling Workshop cannot be combined with any other service.</p>
                  )}
                </div>

                <div className="field">
                  <p className="field__label">Event date</p>
                  <div className="nb-cal">
                    <div className="nb-cal__header">
                      <button
                        className="nb-cal__nav"
                        type="button"
                        aria-label="Previous month"
                        disabled={currentMonthIsToday}
                        onClick={() => changeMonth(-1)}
                      >
                        ‹
                      </button>
                      <span className="nb-cal__month">
                        {new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                      <button
                        className="nb-cal__nav"
                        type="button"
                        aria-label="Next month"
                        onClick={() => changeMonth(1)}
                      >
                        ›
                      </button>
                    </div>
                    <div className="nb-cal__weekdays">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
                    </div>
                    <div className="nb-cal__grid">
                      {calendarCells.map((cell) => {
                        if (cell.blank) return <span key={cell.key} aria-hidden="true"></span>;
                        const blocked = calendarData?.blockedDates.has(cell.date) ?? false;
                        const booked = calendarData?.bookedDates.has(cell.date) ?? false;
                        const disabled = !calendarData || cell.date < today || blocked;
                        const classes = [
                          'nb-cal__day',
                          selectedDate === cell.date ? 'nb-cal__day--selected' : '',
                          blocked ? 'nb-cal__day--blocked' : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <button
                            className={classes}
                            type="button"
                            key={cell.key}
                            disabled={disabled}
                            aria-pressed={selectedDate === cell.date}
                            onClick={() => selectDate(cell.date)}
                          >
                            {cell.day}
                            {booked && <span className="nb-cal__dot" aria-label="Has bookings"></span>}
                          </button>
                        );
                      })}
                    </div>
                    {calendarStatus && (
                      <p className="nb-cal__status status-message" role={calendarData ? 'status' : 'alert'}>
                        {calendarStatus}
                      </p>
                    )}
                    <div className="nb-cal__legend">
                      <span className="nb-cal__legend-dot nb-cal__legend-dot--booked"></span> Has bookings
                      <span className="nb-cal__legend-dot nb-cal__legend-dot--blocked" style={{ marginLeft: '0.75rem' }}></span> Blocked
                    </div>
                  </div>
                  <p className="nb-cal__selected">
                    {selectedDate ? LONG_DATE_FORMAT.format(new Date(`${selectedDate}T00:00:00`)) : 'No date selected'}
                  </p>
                  <FieldError>{fieldErrors.eventDate}</FieldError>
                </div>

                <div className="field">
                  <p className="field__label">Available time slots</p>
                  <p className="field__hint">{bookingHoursNote}</p>
                  {availabilityError
                    ? <p className="status-message" role="alert">{availabilityError}</p>
                    : <p className="status-message" role="status">{availabilityStatus}</p>}
                  {!availability.wholeDay && availability.slots.length > 0 && (
                    <div className="nb-slot-grid" role="group" aria-label="Available time slots">
                      {availability.slots.map((slot) => (
                        <button
                          className={`nb-slot${selectedSlot?.startTime === slot.startTime ? ' nb-slot--selected' : ''}`}
                          type="button"
                          key={slot.startTime}
                          aria-pressed={selectedSlot?.startTime === slot.startTime}
                          onClick={() => {
                            setSelectedSlot(slot);
                            setFieldErrors((current) => ({ ...current, startTime: '' }));
                          }}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <FieldError>{fieldErrors.startTime}</FieldError>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="bookingAddress">
                    Event address <span className="nb-optional">(optional)</span>
                  </label>
                  <input
                    className="field__input"
                    id="bookingAddress"
                    name="eventAddress"
                    type="text"
                    maxLength="255"
                    value={eventAddress}
                    onChange={(event) => setEventAddress(event.target.value)}
                  />
                  <FieldError>{fieldErrors.eventAddress}</FieldError>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="voucherCode">
                    Voucher code <span className="nb-optional">(optional)</span>
                  </label>
                  <div className="input-group">
                    <input
                      className="field__input"
                      id="voucherCode"
                      name="voucherCode"
                      type="text"
                      placeholder="e.g. DISC10"
                      style={{ borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}
                      value={voucherCode}
                      onChange={(event) => {
                        setVoucherCode(event.target.value);
                        setAppliedVoucher(null);
                        setVoucherHint('');
                        setVoucherError('');
                      }}
                    />
                    <button
                      className="btn"
                      type="button"
                      disabled={voucherPending}
                      style={{ borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', whiteSpace: 'nowrap' }}
                      onClick={() => void applyVoucher()}
                    >
                      {voucherPending ? 'Checking…' : 'Apply'}
                    </button>
                  </div>
                  {voucherHint && <p className="field__hint">{voucherHint}</p>}
                  {voucherError && <p className="field__error">{voucherError}</p>}
                  {fieldErrors.voucherCode && <p className="field__error">{fieldErrors.voucherCode}</p>}
                </div>

                {selectedServices.length > 0 && (
                  <div className="nb-summary panel">
                    <p className="nb-summary__title">Order summary</p>
                    <table className="nb-summary__table">
                      <tbody>
                        {selectedServices.map((service) => (
                          <tr key={service.id}>
                            <td>{service.name}</td>
                            <td>{formatPeso(service.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr><td>Subtotal</td><td>{formatPeso(subtotal)}</td></tr>
                        {discount > 0 && (
                          <tr>
                            <td>Discount ({appliedVoucher.voucherCode})</td>
                            <td>− {formatPeso(discount)}</td>
                          </tr>
                        )}
                        <tr className="nb-summary__total"><td>Total</td><td>{formatPeso(total)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <div className="nb-nav">
                <button className="btn" type="button" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn--primary" type="button" onClick={continueToPayment}>
                  Continue →
                </button>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="nb-panel" aria-labelledby="step4Title">
              <h2 className="nb-panel__title" id="step4Title">Downpayment</h2>
              <p className="nb-panel__sub">Record the 50% downpayment received from the client.</p>
              {paymentError && <p className="alert alert--error" role="alert">{paymentError}</p>}
              <div className="nb-form-body">
                <div className="nb-dp-info panel">
                  <div>
                    <p className="nb-dp-info__label">Total amount</p>
                    <p className="nb-dp-info__value">{formatPeso(total)}</p>
                  </div>
                  <div>
                    <p className="nb-dp-info__label">Required downpayment (50%)</p>
                    <p className="nb-dp-info__value nb-dp-info__value--highlight">{formatPeso(requiredDownpayment)}</p>
                  </div>
                </div>
                <div className={`field${fieldErrors.method ? ' field--invalid' : ''}`}>
                  <label className="field__label" htmlFor="paymentMethod">Payment method</label>
                  <select
                    className="field__input"
                    id="paymentMethod"
                    name="method"
                    value={paymentMethod}
                    onChange={(event) => {
                      setPaymentMethod(event.target.value);
                      setFieldErrors((current) => ({ ...current, method: '' }));
                    }}
                  >
                    <option value="">Select method</option>
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                  </select>
                  <FieldError>{fieldErrors.method}</FieldError>
                </div>
                {!markDownpayment && (
                  <div className={`field${fieldErrors.amount ? ' field--invalid' : ''}`}>
                    <label className="field__label" htmlFor="paymentAmount">Amount received</label>
                    <div className="input-group">
                      <span className="input-group__prefix">₱</span>
                      <input
                        className="field__input"
                        id="paymentAmount"
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={paymentAmount}
                        onChange={(event) => {
                          setPaymentAmount(event.target.value);
                          setFieldErrors((current) => ({ ...current, amount: '' }));
                        }}
                      />
                    </div>
                    <FieldError>{fieldErrors.amount}</FieldError>
                  </div>
                )}
                <label className="nb-checkbox">
                  <input
                    type="checkbox"
                    checked={markDownpayment}
                    onChange={(event) => {
                      setMarkDownpayment(event.target.checked);
                      setFieldErrors((current) => ({ ...current, amount: '' }));
                    }}
                  />
                  <span>Use the exact 50% downpayment amount</span>
                </label>
                <div className="field">
                  <label className="field__label" htmlFor="paymentNote">
                    Note <span className="nb-optional">(optional)</span>
                  </label>
                  <input
                    className="field__input"
                    id="paymentNote"
                    name="note"
                    type="text"
                    maxLength="255"
                    placeholder="e.g. Paid in full on-site"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                  />
                </div>
              </div>
              <div className="nb-nav">
                <button className="btn" type="button" disabled={submitting} onClick={() => setStep(3)}>← Back</button>
                <button className="btn btn--primary" type="button" disabled={submitting} onClick={() => void submitBooking()}>
                  {submitting ? 'Recording…' : 'Record booking'}
                </button>
              </div>
            </section>
          )}

          {step === 5 && success && (
            <section className="nb-panel nb-success" aria-labelledby="successTitle">
              <div className="nb-success__icon" aria-hidden="true">✓</div>
              <h2 className="nb-panel__title" id="successTitle">Booking recorded!</h2>
              <p className="nb-success__ref">Booking #{success.reference}</p>
              <p className="nb-success__detail">{success.customerName} · {success.bookingStatus}</p>
              <div className="nb-nav nb-nav--center">
                <Link className="btn btn--primary" to="/admin/html/bookings.html">Go to Bookings</Link>
                <button className="btn" type="button" onClick={startAnotherBooking}>New booking</button>
              </div>
            </section>
          )}
        </div>
      </main>
    </AdminLayout>
  );
}

export default AdminNewBookingPage;
