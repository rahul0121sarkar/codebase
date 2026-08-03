// app.js - minimal express app for the payments + booking work
const express = require('express');
const app = express();

app.use(express.json());

const paymentsRouter = require('./routes/payments');
const bookingRouter = require('./routes/booking');

app.use('/payments', paymentsRouter);
app.use('/booking', bookingRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('crescendo backend listening on ' + PORT);
});

module.exports = app;
