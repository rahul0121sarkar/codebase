// routes/booking.js
const express = require('express');
const router = express.Router();
const Booking = require('../models/bookingModel');

router.post('/book', async (req, res) => {
  try {
    const { user_id, slot_id } = req.body;
    const bookingId = await Booking.bookLesson(user_id, slot_id);
    if (!bookingId) {
      return res.status(400).json({ ok: false, error: 'could not book' });
    }
    res.json({ ok: true, booking_id: bookingId });
  } catch (e) {
    console.log('book failed', e.message);
    res.status(500).json({ ok: false });
  }
});

router.post('/cancel', async (req, res) => {
  try {
    const { booking_id } = req.body;
    const ok = await Booking.cancelBooking(booking_id);
    // TODO: distinguish "too late to cancel" from "not found" for the UI
    res.json({ ok: ok });
  } catch (e) {
    console.log('cancel failed', e.message);
    res.status(500).json({ ok: false });
  }
});

router.post('/add-by-coach', async (req, res) => {
  try {
    const { slot_id, student } = req.body;
    const result = await Booking.addStudentByCoach(slot_id, student || {});
    res.json({ ok: !!result, booking_id: result });
  } catch (e) {
    console.log('add-by-coach failed', e.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
