const express = require('express');
const ctrl = require('../controllers/customerDashboardController');
const requireCustomer = require('../middleware/requireCustomer');
const { uploadSingleImage } = require('../config/upload');

const router = express.Router();

router.use(requireCustomer);

// Bookings list and detail
router.get('/bookings', ctrl.listBookings);
router.get('/bookings/:id/reschedule-availability', ctrl.getRescheduleAvailability);
router.get('/bookings/:id', ctrl.getBookingDetails);

// Payment proof upload
router.post('/bookings/:id/payment', uploadSingleImage('proof'), ctrl.submitPayment);
router.post('/bookings/:id/gcash', ctrl.startGCashPayment);

// Apply voucher to a booking
router.post('/bookings/:id/voucher', ctrl.applyVoucher);

// Reschedule request
router.post('/bookings/:id/reschedule', ctrl.requestReschedule);

// Profile
router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);
router.post('/profile/password', ctrl.changePassword);

module.exports = router;
