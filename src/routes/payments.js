// routes/payments.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentsController');

// wrap so async errors don't crash the process silently
router.get('/', async (req, res) => {
  try {
    await ctrl.index(req, res);
  } catch (e) {
    console.log('payments index failed', e.message);
    res.status(500).json({ error: 'failed' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    await ctrl.summary(req, res);
  } catch (e) {
    console.log('payments summary failed', e.message);
    res.status(500).json({ error: 'failed' });
  }
});

module.exports = router;
