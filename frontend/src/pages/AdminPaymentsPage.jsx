import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { getJson, sendJson } from '../lib/adminApi.js';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

function fromIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  return DATE_FORMAT.format(fromIsoDate(value));
}

function formatDateTime(value) {
  const [datePart, timePart] = value.split(' ');
  const [hours, minutes] = timePart.split(':').map(Number);
  const date = fromIsoDate(datePart);
  date.setHours(hours, minutes);
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)}`;
}

function formatPeso(value) {
  const amount = Number(value);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function paymentError(error, fields) {
  const fieldErrors = error.fieldErrors ?? {};
  const keys = Object.keys(fieldErrors);
  if (keys.length && keys.every((key) => fields.includes(key))) return { message: '', fields: fieldErrors };
  return { message: error.message || 'Something went wrong. Please try again.', fields: {} };
}

function Dialog({ children, className = '', labelledBy, onClose, open }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className={`dialog ${className}`.trim()}
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget || event.target.closest('[data-dialog-close]')) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

function FieldError({ children }) {
  return children ? <p className="field__error">{children}</p> : <p className="field__error" hidden></p>;
}

function PaymentDialogForm({ error, onSubmit, children, className = '' }) {
  return (
    <form className={`dialog__form ${className}`.trim()} noValidate onSubmit={onSubmit}>
      <p className="alert alert--error" role="alert" hidden={!error}>{error}</p>
      {children}
    </form>
  );
}

function AdminPaymentsPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeDialog, setActiveDialog] = useState('');
  const [activePayment, setActivePayment] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [recordAmount, setRecordAmount] = useState('');
  const [recordMethod, setRecordMethod] = useState('Cash');
  const [recordNote, setRecordNote] = useState('');
  const [fullMethod, setFullMethod] = useState('Cash');
  const [toast, setToast] = useState(null);

  async function loadOverview(initial = false) {
    if (initial) setLoading(true);
    setLoadError('');
    try {
      const data = await getJson('/api/admin/payments/overview');
      if (!Array.isArray(data.toReview) || !Array.isArray(data.outstanding)) {
        throw new Error('The server returned an invalid payments overview.');
      }
      setOverview(data);
    } catch (error) {
      setLoadError(error.message || 'Unable to load payments. Please refresh the page.');
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview(true);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  function openDialog(name) {
    setDialogError('');
    setFieldErrors({});
    setPending(false);
    setActiveDialog(name);
  }

  function closeDialog() {
    if (pending) return;
    setActiveDialog('');
    setDialogError('');
    setFieldErrors({});
  }

  function openProof(payment) {
    setActivePayment(payment);
    openDialog('proof');
  }

  function openVerify(payment) {
    setActivePayment(payment);
    openDialog('verify');
  }

  function openReject(payment) {
    setActivePayment(payment);
    setRejectReason('');
    openDialog('reject');
  }

  function openRecord(booking) {
    setActiveBooking(booking);
    setRecordAmount('');
    setRecordMethod('Cash');
    setRecordNote('');
    openDialog('record');
  }

  function openFull(booking) {
    setActiveBooking(booking);
    setFullMethod('Cash');
    openDialog('full');
  }

  async function verifyPayment() {
    if (!activePayment) return;
    setPending(true);
    setDialogError('');
    try {
      const result = await sendJson(`/api/admin/payments/${activePayment.id}/verify`, 'POST', {});
      setActiveDialog('');
      const email = result.email;
      if (email?.status === 'sent') showToast(`Payment verified. E-receipt sent to ${email.to}.`);
      else if (email?.status === 'not_configured') {
        showToast("Payment verified, but the e-receipt was not sent because email isn't set up yet.", 'error');
      } else {
        showToast(`Payment verified, but the e-receipt could not be sent${email?.to ? ` to ${email.to}` : ''}.`, 'error');
      }
      await loadOverview();
    } catch (error) {
      setDialogError(error.message || 'Unable to verify this payment.');
      if (error.status === 409) void loadOverview();
    } finally {
      setPending(false);
    }
  }

  async function submitReject(event) {
    event.preventDefault();
    if (!activePayment) return;
    setPending(true);
    setDialogError('');
    setFieldErrors({});
    try {
      await sendJson(`/api/admin/payments/${activePayment.id}/reject`, 'POST', { reason: rejectReason });
      setActiveDialog('');
      showToast(`Payment from ${activePayment.customerName} was rejected.`);
      await loadOverview();
    } catch (error) {
      const result = paymentError(error, ['reason']);
      setDialogError(result.message);
      setFieldErrors(result.fields);
      if (error.status === 409) void loadOverview();
    } finally {
      setPending(false);
    }
  }

  function describeRecorded(result, booking) {
    const parts = [`${formatPeso(result.recorded)} recorded for #${booking.reference}.`];
    if (result.balance === 0) parts.push('Now fully paid.');
    if (booking.status === 'To Pay' && result.bookingStatus === 'Confirmed') parts.push('Booking confirmed.');
    return parts.join(' ');
  }

  async function submitRecord(event) {
    event.preventDefault();
    if (!activeBooking) return;
    setPending(true);
    setDialogError('');
    setFieldErrors({});
    try {
      const result = await sendJson('/api/admin/payments/record', 'POST', {
        bookingId: activeBooking.id,
        amount: recordAmount,
        method: recordMethod,
        note: recordNote,
      });
      setActiveDialog('');
      showToast(describeRecorded(result, activeBooking));
      await loadOverview();
    } catch (error) {
      const result = paymentError(error, ['amount', 'method', 'note']);
      setDialogError(result.message);
      setFieldErrors(result.fields);
      if (error.status === 409) void loadOverview();
    } finally {
      setPending(false);
    }
  }

  async function submitFull(event) {
    event.preventDefault();
    if (!activeBooking) return;
    setPending(true);
    setDialogError('');
    setFieldErrors({});
    try {
      const result = await sendJson('/api/admin/payments/record', 'POST', {
        bookingId: activeBooking.id,
        markFullyPaid: true,
        method: fullMethod,
      });
      setActiveDialog('');
      showToast(describeRecorded(result, activeBooking));
      await loadOverview();
    } catch (error) {
      const result = paymentError(error, ['method']);
      setDialogError(result.message);
      setFieldErrors(result.fields);
      if (error.status === 409) void loadOverview();
    } finally {
      setPending(false);
    }
  }

  const toReview = overview?.toReview ?? [];
  const outstanding = overview?.outstanding ?? [];

  return (
    <AdminLayout activePage="payments" title="Payments | BRB Studios Admin">
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Finance</p>
          <h1 className="page-header__title">Payments</h1>
          <p className="page-header__subtitle">Review submitted payment proofs and keep track of unpaid balances.</p>
        </header>

        <section className="payments-section" aria-labelledby="reviewTitle">
          <h2 className="section-heading" id="reviewTitle">
            Payments to review <span className="section-heading__count">{toReview.length || ''}</span>
          </h2>
          {toReview.length > 0 && (
            <div className="review-grid">
              {toReview.map((payment) => (
                <article className="panel review-card" key={payment.id}>
                  <button
                    className="review-card__proof"
                    type="button"
                    disabled={!payment.proofUrl}
                    aria-label="Enlarge payment proof"
                    onClick={() => openProof(payment)}
                  >
                    {payment.proofUrl ? (
                      <>
                        <img className="review-card__image" src={payment.proofUrl} alt="Payment proof" />
                        <span className="review-card__expand" aria-hidden="true"></span>
                      </>
                    ) : <span className="review-card__empty">No proof uploaded</span>}
                  </button>
                  <div className="review-card__body">
                    <p className="review-card__reference">#{payment.reference}</p>
                    <h3 className="review-card__name">{payment.customerName}</h3>
                    <p className="review-card__services">{payment.services.join(', ')}</p>
                    <dl className="review-card__amounts">
                      <div><dt>Amount due</dt><dd>{formatPeso(payment.totalAmount)}</dd></div>
                      <div>
                        <dt>{payment.type === 'Downpayment' ? 'Downpayment' : 'Payment'}</dt>
                        <dd>{formatPeso(payment.amount)}</dd>
                      </div>
                      <div><dt>Balance</dt><dd>{formatPeso(payment.balanceAfter)}</dd></div>
                    </dl>
                    <p className="review-card__meta">
                      {[payment.method, payment.referenceNumber && `Ref ${payment.referenceNumber}`, `Submitted ${formatDateTime(payment.submittedAt)}`]
                        .filter(Boolean).join(' · ')}
                    </p>
                    {payment.belowRequiredDownpayment && (
                      <p className="review-card__warning">
                        Below the 50% downpayment of {formatPeso(payment.requiredDownpayment)}.
                      </p>
                    )}
                    <div className="review-card__actions">
                      <button className="btn btn--primary" type="button" onClick={() => openVerify(payment)}>Verify</button>
                      <button className="btn" type="button" onClick={() => openReject(payment)}>Reject</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {(loading || loadError || (!loading && !loadError && toReview.length === 0)) && (
            <p className="status-message" role={loadError ? 'alert' : 'status'}>
              {loading ? 'Loading payments...' : loadError || "You're all caught up. No payments are waiting for review."}
            </p>
          )}
        </section>

        <section className="payments-section" aria-labelledby="outstandingTitle">
          <header className="payments-section__header">
            <h2 className="section-heading" id="outstandingTitle">Outstanding balances</h2>
            <p className="payments-section__summary">
              {outstanding.length > 0
                ? `${outstanding.length} ${outstanding.length === 1 ? 'booking' : 'bookings'} · ${formatPeso(overview?.outstandingTotal)} still to collect`
                : ''}
            </p>
          </header>
          {outstanding.length > 0 && (
            <div className="table-wrap">
              <table className="data-table outstanding-table" aria-labelledby="outstandingTitle">
                <thead>
                  <tr>
                    <th scope="col">Booking</th>
                    <th scope="col">Service</th>
                    <th scope="col">Event Date</th>
                    <th scope="col">Paid / Total</th>
                    <th scope="col">Balance</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map((entry) => {
                    let progress;
                    if (entry.pendingPayments > 0) progress = { text: 'Payment awaiting review', review: true };
                    else if (entry.awaitingDownpayment) progress = { text: 'Awaiting downpayment', review: false };
                    else progress = { text: entry.paidPercent >= 50 ? 'Downpayment paid' : 'Partially paid', review: false };
                    return (
                      <tr className="data-row" key={entry.id}>
                        <td className="outstanding-table__booking">
                          <strong className="outstanding-table__customer">{entry.customerName}</strong>
                          <span className="outstanding-table__reference">#{entry.reference} · {entry.status}</span>
                        </td>
                        <td className="outstanding-table__services">{entry.services.join(', ')}</td>
                        <td>
                          <span className="outstanding-table__date">{formatDate(entry.eventDate)}</span>
                          <span className="outstanding-table__time">{entry.timeLabel}</span>
                          {entry.overdue && <span className="tag tag--overdue">Overdue</span>}
                        </td>
                        <td className="outstanding-table__paid">
                          <span className="outstanding-table__amounts">{formatPeso(entry.amountPaid)} / {formatPeso(entry.totalAmount)}</span>
                          <div className="progress"><div className="progress__bar" style={{ '--percent': `${entry.paidPercent}%` }}></div></div>
                          <span className={`tag outstanding-table__note${progress.review ? ' tag--review' : ''}`}>{progress.text}</span>
                        </td>
                        <td className="outstanding-table__balance">{formatPeso(entry.balance)}</td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn--sm" type="button" onClick={() => openRecord(entry)}>Record Payment</button>
                            <button className="btn btn--sm btn--success" type="button" onClick={() => openFull(entry)}>Mark Fully Paid</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {loading && <p className="status-message" role="status">Loading balances...</p>}
          {!loading && loadError && <p className="status-message" role="alert">Unable to load balances. Please refresh the page.</p>}
          {!loading && !loadError && outstanding.length === 0 && (
            <p className="status-message" role="status">Every accepted booking is fully paid.</p>
          )}
        </section>
      </main>

      <Dialog className="dialog--proof" labelledBy="proofTitle" open={activeDialog === 'proof'} onClose={closeDialog}>
        <div className="dialog__form">
          <header className="dialog__header">
            <h2 className="dialog__title" id="proofTitle">Payment proof</h2>
            <button className="icon-button icon-button--close" type="button" data-dialog-close aria-label="Close"></button>
          </header>
          {activePayment?.proofUrl && <img className="proof-image" src={activePayment.proofUrl} alt="Uploaded payment proof" />}
          {activePayment && (
            <p className="proof-caption">
              #{activePayment.reference} · {activePayment.customerName} · {formatPeso(activePayment.amount)} via {activePayment.method}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog labelledBy="verifyTitle" open={activeDialog === 'verify'} onClose={closeDialog}>
        <div className="dialog__form">
          <h2 className="dialog__title" id="verifyTitle">Verify this payment?</h2>
          {activePayment && (
            <dl className="detail-list">
              <dt>Customer</dt><dd>{activePayment.customerName}</dd>
              <dt>Booking</dt><dd>#{activePayment.reference} · {activePayment.services.join(', ')}</dd>
              <dt>{activePayment.type}</dt><dd>{formatPeso(activePayment.amount)}</dd>
              <dt>Paid through</dt>
              <dd>{activePayment.referenceNumber ? `${activePayment.method} (Ref ${activePayment.referenceNumber})` : activePayment.method}</dd>
              <dt>Balance after</dt><dd>{formatPeso(activePayment.balanceAfter)}</dd>
            </dl>
          )}
          {activePayment?.belowRequiredDownpayment && (
            <p className="alert alert--warning">
              This is below the 50% downpayment of {formatPeso(activePayment.requiredDownpayment)}. The booking stays "To Pay" until the downpayment is complete.
            </p>
          )}
          <p className="dialog__text">
            An e-receipt with the approved date and remaining balance will be emailed to {activePayment?.customerEmail}.
          </p>
          {dialogError && <p className="alert alert--error" role="alert">{dialogError}</p>}
          <div className="dialog__actions">
            <button className="btn" type="button" data-dialog-close disabled={pending}>Cancel</button>
            <button className="btn btn--primary" type="button" disabled={pending} onClick={() => void verifyPayment()}>
              {pending ? 'Verifying...' : 'Verify payment'}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog labelledBy="rejectTitle" open={activeDialog === 'reject'} onClose={closeDialog}>
        <PaymentDialogForm error={dialogError} onSubmit={submitReject}>
          <h2 className="dialog__title" id="rejectTitle">Reject this payment?</h2>
          <p className="dialog__text">
            {activePayment && `${formatPeso(activePayment.amount)} from ${activePayment.customerName} for #${activePayment.reference} will be rejected. The customer can submit a new payment.`}
          </p>
          <div className={`field${fieldErrors.reason ? ' field--invalid' : ''}`}>
            <label className="field__label" htmlFor="rejectReason">Reason (shown to the customer)</label>
            <textarea
              className="field__input"
              id="rejectReason"
              name="reason"
              rows="3"
              maxLength="255"
              placeholder="e.g. The screenshot is blurry. Please upload a clear copy."
              value={rejectReason}
              onChange={(event) => {
                setRejectReason(event.target.value);
                setFieldErrors((current) => ({ ...current, reason: '' }));
              }}
            />
            <FieldError>{fieldErrors.reason}</FieldError>
          </div>
          <div className="dialog__actions">
            <button className="btn" type="button" data-dialog-close disabled={pending}>Cancel</button>
            <button className="btn btn--danger-solid" type="submit" disabled={pending}>{pending ? 'Rejecting...' : 'Reject payment'}</button>
          </div>
        </PaymentDialogForm>
      </Dialog>

      <Dialog labelledBy="recordTitle" open={activeDialog === 'record'} onClose={closeDialog}>
        <PaymentDialogForm error={dialogError} onSubmit={submitRecord}>
          <h2 className="dialog__title" id="recordTitle">Record a payment</h2>
          <p className="dialog__text">
            {activeBooking && `#${activeBooking.reference} · ${activeBooking.customerName}. Remaining balance: ${formatPeso(activeBooking.balance)}.`}
          </p>
          <div className={`field${fieldErrors.amount ? ' field--invalid' : ''}`}>
            <label className="field__label" htmlFor="recordAmount">Amount received</label>
            <div className="input-group">
              <span className="input-group__prefix" aria-hidden="true">₱</span>
              <input
                className="field__input"
                id="recordAmount"
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={recordAmount}
                onChange={(event) => {
                  setRecordAmount(event.target.value);
                  setFieldErrors((current) => ({ ...current, amount: '' }));
                }}
              />
            </div>
            <button className="field__shortcut" type="button" onClick={() => setRecordAmount(String(activeBooking?.balance ?? ''))}>
              {activeBooking && `Fill in the full balance (${formatPeso(activeBooking.balance)})`}
            </button>
            <FieldError>{fieldErrors.amount}</FieldError>
          </div>
          <div className={`field${fieldErrors.method ? ' field--invalid' : ''}`}>
            <label className="field__label" htmlFor="recordMethod">Received through</label>
            <select className="field__input" id="recordMethod" name="method" value={recordMethod} onChange={(event) => setRecordMethod(event.target.value)}>
              <option value="Cash">Cash</option><option value="GCash">GCash</option>
            </select>
            <FieldError>{fieldErrors.method}</FieldError>
          </div>
          <div className={`field${fieldErrors.note ? ' field--invalid' : ''}`}>
            <label className="field__label" htmlFor="recordNote">Note (optional)</label>
            <input
              className="field__input"
              id="recordNote"
              name="note"
              type="text"
              maxLength="255"
              placeholder="e.g. Paid at the studio"
              value={recordNote}
              onChange={(event) => {
                setRecordNote(event.target.value);
                setFieldErrors((current) => ({ ...current, note: '' }));
              }}
            />
            <FieldError>{fieldErrors.note}</FieldError>
          </div>
          <div className="dialog__actions">
            <button className="btn" type="button" data-dialog-close disabled={pending}>Cancel</button>
            <button className="btn btn--primary" type="submit" disabled={pending}>{pending ? 'Recording...' : 'Record payment'}</button>
          </div>
        </PaymentDialogForm>
      </Dialog>

      <Dialog labelledBy="fullTitle" open={activeDialog === 'full'} onClose={closeDialog}>
        <PaymentDialogForm error={dialogError} onSubmit={submitFull}>
          <h2 className="dialog__title" id="fullTitle">Mark as fully paid?</h2>
          <p className="dialog__text">
            {activeBooking && `${formatPeso(activeBooking.balance)} will be recorded as received for #${activeBooking.reference} (${activeBooking.customerName}), and the booking will leave this list.`}
          </p>
          <div className={`field${fieldErrors.method ? ' field--invalid' : ''}`}>
            <label className="field__label" htmlFor="fullMethod">Received through</label>
            <select className="field__input" id="fullMethod" name="method" value={fullMethod} onChange={(event) => setFullMethod(event.target.value)}>
              <option value="Cash">Cash</option><option value="GCash">GCash</option>
            </select>
            <FieldError>{fieldErrors.method}</FieldError>
          </div>
          <div className="dialog__actions">
            <button className="btn" type="button" data-dialog-close disabled={pending}>Cancel</button>
            <button className="btn btn--success" type="submit" disabled={pending}>{pending ? 'Saving...' : 'Mark as fully paid'}</button>
          </div>
        </PaymentDialogForm>
      </Dialog>
      {toast && <p className={`toast${toast.type === 'error' ? ' toast--error' : ''}`} role="status">{toast.message}</p>}
    </AdminLayout>
  );
}

export default AdminPaymentsPage;
