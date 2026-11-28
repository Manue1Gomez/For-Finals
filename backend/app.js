const path = require('path');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { testConnection } = require('./config/db');
const sessionMiddleware = require('./config/session');
const { UPLOADS_ROOT } = require('./config/upload');
const customerModel = require('./models/customerModel');
const serviceModel = require('./models/serviceModel');
const bookingModel = require('./models/bookingModel');
const blockedDateModel = require('./models/blockedDateModel');
const paymentModel = require('./models/paymentModel');
const voucherModel = require('./models/voucherModel');
const adminModel = require('./models/adminModel');
const rescheduleModel = require('./models/rescheduleModel');
const { requireAdmin, requireAdminPage } = require('./middleware/requireAdmin');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const adminServiceRoutes = require('./routes/adminServiceRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const adminCalendarRoutes = require('./routes/adminCalendarRoutes');
const adminPaymentRoutes = require('./routes/adminPaymentRoutes');
const adminBookingRoutes = require('./routes/adminBookingRoutes');
const adminReportRoutes = require('./routes/adminReportRoutes');
const adminVoucherRoutes = require('./routes/adminVoucherRoutes');
const adminRescheduleRoutes = require('./routes/adminRescheduleRoutes');
const adminClientRoutes = require('./routes/adminClientRoutes');
const adminWalkInRoutes = require('./routes/adminWalkInRoutes');
const adminWorkshopRoutes = require('./routes/adminWorkshopRoutes');
const customerBookingRoutes = require('./routes/customerBookingRoutes');
const customerDashboardRoutes = require('./routes/customerDashboardRoutes');
const contractRoutes = require('./routes/contractRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIST_ROOT = path.join(__dirname, '..', 'frontend', 'dist');

// NetCorePay webhook needs the raw request body, so it must be mounted before express.json().
app.use('/api/webhooks', webhookRoutes);
app.use(express.json());
app.use(sessionMiddleware);
app.use(requireAdminPage);
app.get([
  '/admin/html/dashboard.html',
  '/admin/html/payments.html',
  '/admin/html/bookings.html',
  '/admin/html/calendar.html',
  '/admin/html/clients.html',
  '/admin/html/new-booking.html',
  '/admin/html/reports.html',
  '/admin/html/reschedule-requests.html',
  '/admin/html/services.html',
  '/admin/html/vouchers.html',
], (req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIST_ROOT, 'index.html'), (error) => {
    if (error) next(error);
  });
});
app.use(express.static(FRONTEND_DIST_ROOT));
app.use(
  '/uploads',
  express.static(UPLOADS_ROOT, {
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  })
);

app.get('/', (req, res) => res.redirect('/customer/html/home.html'));
app.get('/admin', (req, res) => res.redirect('/admin/html/dashboard.html'));
app.get('/customer/html/:page', (req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIST_ROOT, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/bookings', customerBookingRoutes);
app.use('/api/customer', customerDashboardRoutes);
app.use('/api/contract', contractRoutes);
app.use('/api/admin', requireAdmin);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/services', adminServiceRoutes);
app.use('/api/admin/calendar', adminCalendarRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/admin/bookings', adminBookingRoutes);
app.use('/api/admin/reports', adminReportRoutes);
app.use('/api/admin/vouchers', adminVoucherRoutes);
app.use('/api/admin/reschedule', adminRescheduleRoutes);
app.use('/api/admin/clients', adminClientRoutes);
app.use('/api/admin/walk-in', adminWalkInRoutes);
app.use('/api/admin/workshop-students', adminWorkshopRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' });
});

app.use((error, req, res, next) => {
  const isClientError = error.status >= 400 && error.status < 500;

  if (!isClientError) console.error(error);

  res.status(isClientError ? error.status : 500).json({
    message: isClientError ? 'Invalid request.' : 'Something went wrong. Please try again.',
  });
});

app.listen(PORT, async () => {
  console.log(`BRB Studios running at http://localhost:${PORT}`);

  try {
    await testConnection();
    console.log('Database connected');

    const problems = [
      ...(await customerModel.verifySchema()),
      ...(await serviceModel.verifySchema()),
      ...(await bookingModel.verifySchema()),
      ...(await blockedDateModel.verifySchema()),
      ...(await paymentModel.verifySchema()),
      ...(await voucherModel.verifySchema()),
      ...(await adminModel.verifySchema()),
      ...(await rescheduleModel.verifySchema()),
    ];
    problems.forEach((problem) => console.warn(`Database warning: ${problem}`));
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
  }
});
