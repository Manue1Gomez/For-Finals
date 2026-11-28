import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageStyles from '../components/PageStyles.jsx';
import { getJson } from '../lib/api.js';

const STUDIO_MAP_URL = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.bing.com%2Fmaps%2Fdefault.aspx%3Fv%3D2%26pc%3DFACEBK%26mid%3D8100%26where1%3D13.932117479722%252C%2520120.81314808899%26FORM%3DFBKPL1%26name%3DMarasigan%2520St.%2520Poblacion%25204%252C%2520Calaca%2520City%252C%2520Calaca%252C%2520Philippines%252C%25204212%26mkt%3Den-GB%26fbclid%3DIwZXh0bgNhZW0CMTAAcGRvZgVicmlkETFWekJxRFV4WEpYODJPaXRnc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABH0WStDvUVIv76aw0_9FUWlrV32tO_Jtvw5JwjSmXP9k9JucgbbRkdWnHKP7U_aem_wS08rMv-8UNYNwPW9y1TKw&h=AUD2XMspgMC1iEqx1S5lERRr4114H8tg-UQazJSYYBR_-U44t6VqTZ_PrdzNJaVksXfUQeYI5bO-py7ve4KPCNMbzRN5muBXxZaGAzfn0bexOPa_ZuSTif751kWEiIwDXoFd';
const longDateFormat = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function formatLongDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return longDateFormat.format(new Date(year, month - 1, day));
}

function formatPeso(amount) {
  const value = Number(amount);
  const decimals = Number.isInteger(value) ? 0 : 2;
  return `₱ ${value.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function statusSlug(status) {
  return String(status ?? '').toLowerCase().replace(/\s+/g, '');
}

function goBack(fromAdmin, navigate) {
  if (window.opener && !window.opener.closed) {
    window.close();
  } else if (window.history.length > 1) {
    window.history.back();
  } else {
    navigate(fromAdmin ? '/admin/html/bookings.html' : '/customer/html/my-bookings.html');
  }
}

export default function ContractPage() {
  const navigate = useNavigate();
  const bookingId = new URLSearchParams(window.location.search).get('id');
  const fromAdmin = new URLSearchParams(window.location.search).get('from') === 'admin';
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadContract() {
      if (!bookingId) {
        setError('No booking ID specified.');
        setLoading(false);
        return;
      }

      try {
        const response = await getJson(`/api/contract/${encodeURIComponent(bookingId)}`);
        if (!response.ok) {
          throw new Error(response.data?.message || 'This contract could not be loaded.');
        }

        const result = response.data;
        if (!result?.customer || !Array.isArray(result.services)) {
          throw new Error('The server returned an invalid contract response.');
        }

        if (!cancelled) setContract(result);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error
            ? loadError.message
            : 'Unable to reach the server. Please check your connection.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadContract();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const title = contract ? `Contract BRB-${contract.reference} | BRB Studios` : 'Booking Contract | BRB Studios';

  return (
    <>
      <PageStyles bodyClass="" title={title} />

      <div className="contract-toolbar no-print">
        <button className="contract-toolbar__back" type="button" onClick={() => goBack(fromAdmin, navigate)}>
          Back
        </button>
        <button className="contract-toolbar__print" type="button" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      {loading && <div className="contract-loading" role="status">Loading contract...</div>}
      {!loading && error && <div className="contract-error" role="alert">{error}</div>}

      {!loading && contract && (
        <article className="contract-page">
          <header className="contract-header">
            <img className="contract-header__logo" src="/customer/CustomerImages/brb-logo.png" alt="BRB Studios" />
            <div className="contract-header__info">
              <p className="contract-header__studio">BRB Studios</p>
              <p>
                <a className="contract-link" href={STUDIO_MAP_URL} target="_blank" rel="noopener noreferrer">
                  Marasigan St. Poblacion 4, Calaca City, Philippines 4212
                </a>
              </p>
              <p>
                <a className="contract-link" href="tel:+639051738581">0905 173 8581</a>
                {' · '}
                <a className="contract-link" href="mailto:inquiry.teambrb@gmail.com">inquiry.teambrb@gmail.com</a>
              </p>
            </div>
          </header>

          <h1 className="contract-title">Service Agreement / Contract</h1>

          <div className="contract-meta">
            <span>Contract No.: <strong>BRB - {contract.reference}</strong></span>
            <span>Date Issued: <strong>{formatLongDate(contract.createdAt)}</strong></span>
            <span className={`contract-meta__status contract-meta__status--${statusSlug(contract.status)}`}>
              {contract.status}
            </span>
          </div>

          <hr className="contract-divider" />

          <section className="contract-section">
            <h2 className="contract-section__title">Parties</h2>
            <div className="contract-parties">
              <div className="contract-party">
                <p className="contract-party__label">Service Provider</p>
                <p className="contract-party__name">BRB Studios</p>
                <p>Owner: John Roy Marasigan</p>
                <p>
                  <a className="contract-link" href={STUDIO_MAP_URL} target="_blank" rel="noopener noreferrer">
                    Marasigan St. Poblacion 4, Calaca City, Calaca, Philippines, 4212
                  </a>
                </p>
                <p><a className="contract-link" href="tel:+639051738581">0905 173 8581</a></p>
              </div>
              <div className="contract-party">
                <p className="contract-party__label">Client</p>
                <p className="contract-party__name">{contract.customer.name || '—'}</p>
                <p>{contract.customer.email || '—'}</p>
                <p>{contract.customer.contactNumber || '—'}</p>
              </div>
            </div>
          </section>

          <section className="contract-section">
            <h2 className="contract-section__title">Services Booked</h2>
            <table className="contract-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th className="contract-table__right">Price</th>
                </tr>
              </thead>
              <tbody>
                {contract.services.map((service, index) => (
                  <tr key={`${service.name}-${index}`}>
                    <td>{service.name}</td>
                    <td className="contract-table__right">{formatPeso(service.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Subtotal</td>
                  <td className="contract-table__right">{formatPeso(contract.subtotal)}</td>
                </tr>
                {contract.discountAmount > 0 && (
                  <tr>
                    <td>{contract.voucherCode ? `Discount (${contract.voucherCode})` : 'Discount'}</td>
                    <td className="contract-table__right">− {formatPeso(contract.discountAmount)}</td>
                  </tr>
                )}
                <tr className="contract-table__total">
                  <td>Total Amount</td>
                  <td className="contract-table__right">{formatPeso(contract.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="contract-section">
            <h2 className="contract-section__title">Schedule</h2>
            <dl className="contract-dl">
              <dt>Event Date</dt><dd>{formatLongDate(contract.eventDate)}</dd>
              <dt>Time</dt><dd>{contract.timeLabel || '—'}</dd>
              <dt>Venue / Address</dt><dd>{contract.eventAddress || 'To be confirmed'}</dd>
            </dl>
          </section>

          <section className="contract-section">
            <h2 className="contract-section__title">Payment Terms</h2>
            <p>
              A <strong>50% downpayment</strong> is required to confirm and reserve the booking schedule.
              The remaining balance is due on or before the event date.
            </p>
            <dl className="contract-dl contract-dl--payment">
              <dt>Total Amount</dt><dd>{formatPeso(contract.totalAmount)}</dd>
              <dt>50% Downpayment</dt><dd>{formatPeso(contract.requiredDownpayment)}</dd>
              <dt>Amount Paid</dt><dd>{formatPeso(contract.amountPaid)}</dd>
              <dt>Remaining Balance</dt><dd>{formatPeso(contract.balance)}</dd>
            </dl>
          </section>

          <section className="contract-section">
            <h2 className="contract-section__title">Terms and Conditions</h2>
            <ol className="contract-terms">
              <li>The client agrees to pay a 50% downpayment upon confirmation of the booking. The remaining balance must be settled on or before the event date.</li>
              <li>The downpayment is <strong>non-refundable</strong> once the booking is confirmed, except in cases of force majeure or cancellation initiated by BRB Studios.</li>
              <li>Rescheduling requests must be submitted through the online booking system at least 7 days before the event date and are subject to studio availability and owner approval.</li>
              <li>The Modeling Workshop service may only be rescheduled by the studio owner.</li>
              <li>BRB Studios reserves the right to cancel or reschedule bookings due to unforeseen circumstances, with prior notice to the client.</li>
              <li>The client agrees to cooperate and be available at the agreed schedule. Delays caused by the client may affect the quality or completion of services.</li>
              <li>BRB Studios will not be held liable for any damages caused by factors beyond its reasonable control.</li>
              <li>By proceeding with the booking, the client acknowledges and agrees to these terms and conditions.</li>
            </ol>
          </section>

          <section className="contract-section contract-section--signatures">
            <h2 className="contract-section__title">Signatures</h2>
            <div className="contract-signatures">
              <div className="contract-sig">
                <div className="contract-sig__line"></div>
                <p className="contract-sig__name">John Roy Marasigan</p>
                <p className="contract-sig__role">Owner, BRB Studios</p>
                <p className="contract-sig__date">Date: _______________</p>
              </div>
              <div className="contract-sig">
                <div className="contract-sig__line"></div>
                <p className="contract-sig__name">{contract.customer.name || '—'}</p>
                <p className="contract-sig__role">Client</p>
                <p className="contract-sig__date">Date: _______________</p>
              </div>
            </div>
          </section>

          <footer className="contract-footer">
            <p>This contract is generated by the BRB Studios Online Booking System.</p>
            <p>Contract No. BRB - {contract.reference} &nbsp;·&nbsp; BRB Studios &nbsp;·&nbsp; Calaca City, Philippines</p>
          </footer>
        </article>
      )}
    </>
  );
}
