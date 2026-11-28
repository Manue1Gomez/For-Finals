import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageStyles from './components/PageStyles.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import BookServicePage from './pages/BookServicePage.jsx';
import ContractPage from './pages/ContractPage.jsx';
import MyBookingsPage from './pages/MyBookingsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';
import AdminPaymentsPage from './pages/AdminPaymentsPage.jsx';
import AdminBookingsPage from './pages/AdminBookingsPage.jsx';
import AdminReschedulePage from './pages/AdminReschedulePage.jsx';
import AdminCalendarPage from './pages/AdminCalendarPage.jsx';
import AdminServicesPage from './pages/AdminServicesPage.jsx';
import AdminClientsPage from './pages/AdminClientsPage.jsx';
import AdminVouchersPage from './pages/AdminVouchersPage.jsx';
import AdminReportsPage from './pages/AdminReportsPage.jsx';
import AdminNewBookingPage from './pages/AdminNewBookingPage.jsx';

function RouteScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash, pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <RouteScrollManager />
      <Routes>
        <Route path="/" element={<Navigate to="/customer/html/home.html" replace />} />
        <Route path="/customer/html/home.html" element={<HomePage />} />
        <Route path="/customer/html/login.html" element={<LoginPage />} />
        <Route path="/customer/html/register.html" element={<RegisterPage />} />
        <Route path="/customer/html/book-service.html" element={<BookServicePage />} />
        <Route path="/customer/html/contract.html" element={<ContractPage />} />
        <Route path="/customer/html/my-bookings.html" element={<MyBookingsPage />} />
        <Route path="/customer/html/profile.html" element={<ProfilePage />} />
        <Route path="/customer/html/settings.html" element={<SettingsPage />} />
        <Route path="/admin/html/dashboard.html" element={<AdminDashboardPage />} />
        <Route path="/admin/html/payments.html" element={<AdminPaymentsPage />} />
        <Route path="/admin/html/bookings.html" element={<AdminBookingsPage />} />
        <Route path="/admin/html/reschedule-requests.html" element={<AdminReschedulePage />} />
        <Route path="/admin/html/calendar.html" element={<AdminCalendarPage />} />
        <Route path="/admin/html/services.html" element={<AdminServicesPage />} />
        <Route path="/admin/html/clients.html" element={<AdminClientsPage />} />
        <Route path="/admin/html/vouchers.html" element={<AdminVouchersPage />} />
        <Route path="/admin/html/reports.html" element={<AdminReportsPage />} />
        <Route path="/admin/html/new-booking.html" element={<AdminNewBookingPage />} />
        <Route
          path="*"
          element={(
            <>
              <PageStyles bodyClass="" title="Page not found | BRB Studios" />
              <main className="not-found">
                <h1>Page not found</h1>
                <Link to="/customer/html/home.html">Return to BRB Studios</Link>
              </main>
            </>
          )}
        />
      </Routes>
    </>
  );
}
