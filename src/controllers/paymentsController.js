// paymentsController.js - payments dashboard endpoints
const Payment = require("../models/paymentModel");

// main payments table page (returns JSON here; the CI version rendered a view)
async function index(req, res) {
  const filters = {
    from: req.query.from,
    to: req.query.to,
    status: req.query.status,
    trainer_id: req.query.trainer_id,
  };

  let page = parseInt(req.query.page, 10);
  if (!page || page < 1) page = 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  const invoices = await Payment.getInvoices(filters, limit, offset);

  // decorate each row with the display names
  // const rows = [];
  // for (const inv of invoices) {
  //   //N +1 query problem here
  //   inv.program_name = await Payment.getProgramName(inv.package_id);
  //   inv.plan_name = await Payment.getPlanName(inv.plan_id);
  //   inv.coach_name = await Payment.getCoachName(inv);
  //   rows.push(inv);
  // }

  const rows = invoices;

  const total = await Payment.countInvoices(filters);

  res.json({
    rows: rows,
    total: total,
    page: page,
    filters: filters,
  });
}

// ajax - fires from the dashboard header. cards + retained tile.
async function summary(req, res) {
  const filters = {
    from: req.query.from,
    to: req.query.to,
    trainer_id: req.query.trainer_id,
  };

  const mode = req.query.mode; // 'gross' | 'actual'
  const summary = await Payment.getSummary(filters);
  const retained = await Payment.getRetainedAfterRefund(filters);

  const headline =
    mode == "actual" ? summary.actual_incoming : summary.gross_revenue;

  res.json({
    headline: round2(headline),
    gross: round2(summary.gross_revenue),
    actual: round2(summary.actual_incoming),
    retained: round2(retained),
    count: summary.count,
  });
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

module.exports = { index, summary };
