// bookingModel.js - lesson booking. raw SQL via the pool.
const pool = require("../db");

function now() {
  // 'Y-m-d H:i:s' in server local time
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    p(d.getMonth() + 1) +
    "-" +
    p(d.getDate()) +
    " " +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes()) +
    ":" +
    p(d.getSeconds())
  );
}

// book a lesson slot for a student.
// returns the new booking id, or false on failure.
// async function bookLesson(userId, slotId) {
//   const conn = await pool.getConnection();

//   const existingBooking = await hasActiveBooking(userId, slotId, conn);

//   if (existingBooking) {
//     await conn.rollback();
//     return false;
//   }

//   try {
//     await conn.beginTransaction();

//     const [slotRows] = await conn.query(
//       "SELECT * FROM lesson_slots WHERE id = ? LIMIT 1",
//       [slotId],
//     );
//     const slot = slotRows[0];
//     if (!slot || slot.status == "cancelled") {
//       return false;
//     }

//     // find a package to draw a credit from.
//     // student can have more than one active package - we just take the
//     // first active one we find that still has credits left.
//     const [pkgRows] = await pool.query(
//       `SELECT * FROM program_purchased
//      WHERE user_id = ?
//        AND status = 1
//        AND lessons_used < lessons_total
//      ORDER BY id ASC
//      LIMIT 1`,
//       [userId],
//     );
//     const pkg = pkgRows[0];

//     if (!pkg) {
//       return false; // no credits anywhere
//     }

//     const ts = now();
//     const [ins] = await pool.query(
//       `INSERT INTO bookings (user_id, lesson_slot_id, program_purchased_id, trainer_id, status, booked_at)
//      VALUES (?, ?, ?, ?, 'booked', ?)`,
//       [userId, slotId, pkg.id, slot.trainer_id, ts],
//     );
//     const bookingId = ins.insertId;

//     // burn the credit
//     await pool.query(
//       "UPDATE program_purchased SET lessons_used = lessons_used + 1 WHERE id = ?",
//       [pkg.id],
//     );

//     // mark slot full if we hit capacity
//     const [cntRows] = await pool.query(
//       "SELECT COUNT(*) c FROM bookings WHERE lesson_slot_id = ? AND status = 'booked'",
//       [slotId],
//     );
//     const taken = cntRows[0].c;
//     if (taken >= slot.capacity) {
//       await pool.query("UPDATE lesson_slots SET status = 'full' WHERE id = ?", [
//         slotId,
//       ]);
//     }

//     await conn.commit();
//     return bookingId;
//   } catch (err) {
//     await conn.rollback();
//     throw err;
//   } finally {
//     conn.release();
//   }
// }

async function bookLesson(userId, slotId) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Prevent duplicate booking by same student
    const existingBooking = await hasActiveBooking(userId, slotId, conn);

    if (existingBooking) {
      await conn.rollback();
      return false;
    }

    // Lock the slot so two users cannot book simultaneously
    const [slotRows] = await conn.query(
      `SELECT *
       FROM lesson_slots
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [slotId],
    );

    const slot = slotRows[0];

    if (!slot || slot.status === "cancelled" || slot.status === "full") {
      await conn.rollback();
      return false;
    }

    // Lock the package row
    const [pkgRows] = await conn.query(
      `SELECT *
       FROM program_purchased
       WHERE user_id = ?
         AND status = 1
         AND lessons_used < lessons_total
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [userId],
    );

    const pkg = pkgRows[0];

    if (!pkg) {
      await conn.rollback();
      return false;
    }

    const ts = now();

    const [ins] = await conn.query(
      `INSERT INTO bookings
      (
        user_id,
        lesson_slot_id,
        program_purchased_id,
        trainer_id,
        status,
        booked_at
      )
      VALUES (?, ?, ?, ?, 'booked', ?)`,
      [userId, slotId, pkg.id, slot.trainer_id, ts],
    );

    const bookingId = ins.insertId;

    // Burn one lesson credit
    await conn.query(
      `UPDATE program_purchased
       SET lessons_used = lessons_used + 1
       WHERE id = ?`,
      [pkg.id],
    );

    // Check capacity again inside transaction
    const [cntRows] = await conn.query(
      `SELECT COUNT(*) AS c
       FROM bookings
       WHERE lesson_slot_id = ?
         AND status = 'booked'`,
      [slotId],
    );

    const taken = cntRows[0].c;

    if (taken >= slot.capacity) {
      await conn.query(
        `UPDATE lesson_slots
         SET status = 'full'
         WHERE id = ?`,
        [slotId],
      );
    }

    await conn.commit();

    return bookingId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// student cancels a booking
async function cancelBooking(bookingId) {
  const [bRows] = await pool.query(
    "SELECT * FROM bookings WHERE id = ? LIMIT 1",
    [bookingId],
  );
  const b = bRows[0];
  if (!b || b.status != "booked") {
    return false;
  }

  const ok = await canCancel(b.lesson_slot_id);
  if (!ok) {
    return false; // too close to start time
  }

  await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
    [now(), bookingId],
  );

  // give the credit back
  await pool.query(
    "UPDATE program_purchased SET lessons_used = lessons_used - 1 WHERE id = ?",
    [b.program_purchased_id],
  );

  // reopen the slot
  await pool.query("UPDATE lesson_slots SET status = 'open' WHERE id = ?", [
    b.lesson_slot_id,
  ]);

  return true;
}

// can this slot still be cancelled? policy is: up to 2 hours before start.
async function canCancel(slotId) {
  const [rows] = await pool.query(
    "SELECT start_datetime FROM lesson_slots WHERE id = ? LIMIT 1",
    [slotId],
  );
  const slot = rows[0];
  if (!slot) return false;

  const start = new Date(slot.start_datetime).getTime();
  const cutoff = start - 2 * 60 * 60 * 1000;
  return Date.now() < cutoff;
}

// used by the student's "my upcoming lessons" screen to decide whether to
// show the cancel button
async function hasActiveBooking(userId, slotId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT id FROM bookings
     WHERE user_id = ? AND lesson_slot_id = ? AND status = 'booked'
     LIMIT 1`,
    [userId, slotId],
  );
  return rows[0] ? rows[0].id : false;
}

// instructor adds a student to a slot directly from their calendar.
// the student might already be in the system, or the instructor might just
// type a name/phone for someone who isn't.
async function addStudentByCoach(slotId, student) {
  // student = { user_id, name, phone }
  let userId = student.user_id ? student.user_id : 0;

  if (!userId) {
    // create a quick guest record
    const [ins] = await pool.query(
      `INSERT INTO app_users (name, phone, role, is_guest, status, created_at)
       VALUES (?, ?, 'student', 1, 1, ?)`,
      [student.name, student.phone, now()],
    );
    userId = ins.insertId;
  }

  return bookLesson(userId, slotId);
}

module.exports = {
  bookLesson,
  cancelBooking,
  canCancel,
  hasActiveBooking,
  addStudentByCoach,
};
