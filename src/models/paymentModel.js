// paymentModel.js - payments queries. raw SQL via the pool.
const pool = require("../db");

// list for the payments table. paginated.
// returns the raw invoice rows only - names get looked up in the controller.
async function getInvoices(filters, limit, offset) {
  filters = filters || {};
  if (limit == null) limit = 50;
  if (offset == null) offset = 0;

  // the table view filters by created_at
  // let sql = "SELECT ui.* FROM user_invoices ui WHERE 1=1";

  let sql = `
    SELECT
      ui.*,
      p.name AS program_name,
      pl.name AS plan_name,
      au.name AS coach_name

    FROM user_invoices ui

    LEFT JOIN program_purchased pp
      ON pp.id = ui.package_id

    LEFT JOIN programs p
      ON p.id = pp.program_id

    LEFT JOIN program_plans pl
      ON pl.id = ui.plan_id

    LEFT JOIN app_users au
      ON au.id = CASE
        WHEN ui.trainer_id IS NOT NULL AND ui.trainer_id <> 0
          THEN ui.trainer_id
        WHEN ui.created_by <> 1
          THEN ui.created_by
        ELSE NULL
      END

    WHERE 1=1
  `;

  const params = [];

  if (filters.from) {
    sql += " AND ui.payment_date >= ?"; //payment date is important when we recieved the payment not when we generate it so we give payment date
    params.push(filters.from + " 00:00:00");
  }
  if (filters.to) {
    sql += " AND ui.payment_date <= ?";
    params.push(filters.to + " 23:59:59");
  }
  if (filters.status) {
    sql += " AND ui.payment_status = ?";
    params.push(filters.status);
  }
  if (filters.trainer_id !== undefined && filters.trainer_id !== "") {
    sql += " AND ui.trainer_id = ?";
    params.push(filters.trainer_id);
  }

  sql += " ORDER BY ui.payment_date DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countInvoices(filters) {
  filters = filters || {};
  let sql = "SELECT COUNT(*) as cnt FROM user_invoices ui WHERE 1=1";
  const params = [];
  if (filters.from) {
    sql += " AND ui.payment_date >= ?"; //payment date is important when we recieved the payment not when we generate it so we give payment date
    params.push(filters.from + " 00:00:00");
  }
  if (filters.to) {
    sql += " AND ui.payment_date <= ?";
    params.push(filters.to + " 23:59:59");
  }
  if (filters.status) {
    sql += " AND ui.payment_status = ?";
    params.push(filters.status);
  }

  // we need to find which trainer_id is being used in the filters and add it to the query. If the trainer_id is not null or empty, we will add it to the query.
  if (filters.trainer_id !== undefined && filters.trainer_id !== "") {
    sql += " AND ui.trainer_id = ?";
    params.push(filters.trainer_id);
  }
  const [rows] = await pool.query(sql, params);
  return rows[0] ? rows[0].cnt : 0;
}

// -- lookups used per-row by the table (see controller) --
async function getProgramName(packageId) {
  // package_id points at program_purchased, which points at the program
  const [rows] = await pool.query(
    `SELECT p.name
     FROM program_purchased pp
     JOIN programs p ON p.id = pp.program_id
     WHERE pp.id = ?
     LIMIT 1`,
    [packageId],
  );
  return rows[0] ? rows[0].name : "";
}

async function getPlanName(planId) {
  const [rows] = await pool.query(
    "SELECT name FROM program_plans WHERE id = ? LIMIT 1",
    [planId],
  );
  return rows[0] ? rows[0].name : "";
}

// coach name for an invoice row (used by the table).
// rule the team gave me a while back: use trainer_id, but if it's empty
// fall back to whoever created the invoice - unless that's the system user,
// in which case show nothing.
async function getCoachName(invoice) {
  let tid = invoice.trainer_id;
  if (!tid) {
    tid = invoice.created_by;
    if (tid == 1) {
      // system user, don't credit a real coach
      return "";
    }
  }
  const [rows] = await pool.query(
    "SELECT name FROM app_users WHERE id = ? LIMIT 1",
    [tid],
  );
  return rows[0] ? rows[0].name : "";
}

// ---- summary cards on the dashboard ----
// these are the big numbers at the top. they filter on payment_date.
async function getSummary(filters) {
  filters = filters || {};
  let sql = `
    SELECT
      SUM(ui.amount) as gross,
      SUM(ui.gst_amount) as gst,
      SUM(ui.convenience_fee) as conv_fee,
      SUM(ui.discount_amount) as discount,
      COUNT(*) as cnt
    FROM user_invoices ui
    WHERE ui.payment_status = 'paid'`;
  const params = [];

  if (filters.from) {
    sql += " AND ui.payment_date >= ?";
    params.push(filters.from + " 00:00:00");
  }
  if (filters.to) {
    sql += " AND ui.payment_date <= ?";
    params.push(filters.to + " 23:59:59");
  }
  // coach filter on the cards uses COALESCE - treats 0/null the same,
  // ignores the system-user rule
  if (filters.trainer_id !== undefined && filters.trainer_id !== "") {
    sql +=
      " AND COALESCE(NULLIF(ui.trainer_id,0), ui.created_by) = " +
      parseInt(filters.trainer_id, 10);
  }

  const [rows] = await pool.query(sql, params);
  const r = rows[0] || {};

  const gross = r.gross ? Number(r.gross) : 0;
  const conv = r.conv_fee ? Number(r.conv_fee) : 0;
  const gst = r.gst ? Number(r.gst) : 0;

  const out = {};
  out.gross_revenue = gross;
  // "actual incoming" = what actually hits our bank after the gateway settles we need to remove gst from it because we pay that later
  out.actual_incoming = gross - conv;
  out.count = r.cnt ? r.cnt : 0;
  return out;
}

// "retained after refund" tile.
// = money we kept on invoices that were only partially refunded.
// async function getRetainedAfterRefund(filters) {
//   const sql = `
//     SELECT SUM(ui.amount - IFNULL(r.refund_amount,0)) as retained
//     FROM user_invoices ui
//     JOIN invoice_refunds r ON r.invoice_id = ui.id
//     WHERE r.is_partial = 1`;
//   // note: no date filter passthrough here, no way to list the underlying rows
//   const [rows] = await pool.query(sql);
//   return rows[0] && rows[0].retained ? Number(rows[0].retained) : 0;
// }

async function getRetainedAfterRefund(filters) {
  filters = filters || {};

  let sql = `
    SELECT
      SUM(ui.amount - IFNULL(r.refund_amount,0)) AS retained
    FROM user_invoices ui
    JOIN invoice_refunds r
      ON r.invoice_id = ui.id
    WHERE r.is_partial = 1
  `;

  const params = [];

  if (filters.from) {
    sql += " AND ui.payment_date >= ?";
    params.push(filters.from + " 00:00:00");
  }

  if (filters.to) {
    sql += " AND ui.payment_date <= ?";
    params.push(filters.to + " 23:59:59");
  }

  if (filters.trainer_id !== undefined && filters.trainer_id !== "") {
    sql += " AND ui.trainer_id = ?";
    params.push(filters.trainer_id);
  }

  const [rows] = await pool.query(sql, params);

  return rows[0] && rows[0].retained ? Number(rows[0].retained) : 0;
}

module.exports = {
  getInvoices,
  countInvoices,
  getProgramName,
  getPlanName,
  getCoachName,
  getSummary,
  getRetainedAfterRefund,
};
