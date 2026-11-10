// server/billing.js
const express = require('express');
const router = express.Router();
const { db, getSettings, logAudit } = require('./db');
const { calculateBill, roundCurrency } = require('./calculator');
const { requireAuth, optionalAuth } = require('./auth');

// Helper to get previous month string YYYY-MM
function getPreviousMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const y = prevDate.getFullYear();
  const m = String(prevDate.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Helper to compute total payments recorded in payment_transactions
function getFlatPaymentsSum(month, flatId) {
  const row = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM payment_transactions WHERE month = ? AND flat_id = ?'
  ).get(month, Number(flatId));
  return row ? roundCurrency(row.total) : 0;
}

// GET /api/billing/month/:month
// Returns records for all 9 flats for the given month, auto-filling defaults & carried dues
router.get('/month/:month', optionalAuth, (req, res) => {
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM.' });
  }

  const settings = getSettings();
  const unitRate = parseFloat(settings.unit_rate) || 10;
  const meterCharge = parseFloat(settings.meter_charge) || 60;
  const prevMonthStr = getPreviousMonth(month);

  // Get all flats
  const flats = db.prepare('SELECT * FROM flats ORDER BY flat_number ASC').all();

  // Get existing records for this month
  const records = db.prepare('SELECT * FROM billing_records WHERE month = ?').all(month);
  const recordMap = new Map();
  records.forEach(r => recordMap.set(r.flat_id, r));

  // Get previous month records for automatic carry-forward
  const prevRecords = db.prepare('SELECT * FROM billing_records WHERE month = ?').all(prevMonthStr);
  const prevRecordMap = new Map();
  prevRecords.forEach(r => prevRecordMap.set(r.flat_id, r));

  const resultFlats = [];
  let totalUnits = 0;
  let totalElectricity = 0;
  let totalHouseRent = 0;
  let totalDue = 0;
  let totalPayable = 0;
  let totalPaid = 0;

  for (const flat of flats) {
    let rec = recordMap.get(flat.id);
    const prevRec = prevRecordMap.get(flat.id);

    // Fetch payment transactions for this flat and month
    const payments = db.prepare(
      'SELECT * FROM payment_transactions WHERE month = ? AND flat_id = ? ORDER BY payment_date ASC, id ASC'
    ).all(month, flat.id);

    const txPaidSum = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    if (!rec) {
      // Automatic Carry-Forward from previous month:
      // 1. Previous reading = previous month's current reading
      // 2. Previous due = previous month's final remaining due (total_payable - amount_paid)
      // 3. House rent = previous month's rent (or default_rent)
      const suggestedPrevious = prevRec ? Number(prevRec.current_reading) || 0 : 0;
      const carriedDue = prevRec ? Math.max(0, roundCurrency((Number(prevRec.total_payable) || 0) - (Number(prevRec.amount_paid) || 0))) : 0;
      const suggestedRent = prevRec && Number(prevRec.house_rent) > 0 ? Number(prevRec.house_rent) : (Number(flat.default_rent) || 0);
      const suggestedTenant = flat.tenant_name || (prevRec ? prevRec.tenant_name : '');

      const calc = calculateBill({
        currentReading: suggestedPrevious,
        previousReading: suggestedPrevious,
        houseRent: suggestedRent,
        dueAmount: carriedDue,
        unitRate,
        meterCharge,
        amountPaid: txPaidSum
      });

      rec = {
        id: null,
        month,
        flat_id: flat.id,
        flat_number: flat.flat_number,
        flat_name: flat.flat_name,
        tenant_name: suggestedTenant,
        phone: flat.phone,
        previous_reading: calc.previousReading,
        current_reading: calc.currentReading,
        units_used: calc.unitsUsed,
        unit_rate: calc.unitRate,
        meter_charge: calc.meterCharge,
        electricity_bill: calc.electricityBill,
        house_rent: calc.houseRent,
        due_amount: calc.dueAmount,
        total_payable: calc.totalPayable,
        amount_paid: txPaidSum,
        remaining_due: calc.totalPayable - txPaidSum,
        payment_status: txPaidSum >= calc.totalPayable && calc.totalPayable > 0 ? 'PAID' : (txPaidSum > 0 ? 'PARTIALLY PAID' : 'UNPAID'),
        notes: flat.notes || '',
        updated_at: null,
        is_saved: false,
        carried_from_prev_month: prevRec ? true : false,
        prev_month_due: carriedDue,
        payments
      };
    } else {
      rec.flat_number = flat.flat_number;
      rec.flat_name = flat.flat_name;
      rec.tenant_name = flat.tenant_name || rec.tenant_name;
      rec.phone = flat.phone;
      rec.is_saved = true;

      // Ensure amount_paid matches transactions if transactions exist
      if (payments.length > 0) {
        rec.amount_paid = txPaidSum;
      }
      rec.remaining_due = Math.max(0, roundCurrency(rec.total_payable - rec.amount_paid));

      if (rec.amount_paid >= rec.total_payable && rec.total_payable > 0) {
        rec.payment_status = 'PAID';
      } else if (rec.amount_paid > 0 && rec.amount_paid < rec.total_payable) {
        rec.payment_status = 'PARTIALLY PAID';
      } else {
        rec.payment_status = 'UNPAID';
      }

      rec.payments = payments;
      rec.prev_month_due = prevRec ? Math.max(0, roundCurrency((Number(prevRec.total_payable) || 0) - (Number(prevRec.amount_paid) || 0))) : 0;
    }

    totalUnits = roundCurrency(totalUnits + rec.units_used);
    totalElectricity = roundCurrency(totalElectricity + rec.electricity_bill);
    totalHouseRent = roundCurrency(totalHouseRent + rec.house_rent);
    totalDue = roundCurrency(totalDue + rec.due_amount);
    totalPayable = roundCurrency(totalPayable + rec.total_payable);
    totalPaid = roundCurrency(totalPaid + rec.amount_paid);

    resultFlats.push(rec);
  }

  const totalOutstanding = Math.max(0, roundCurrency(totalPayable - totalPaid));

  res.json({
    month,
    prevMonth: prevMonthStr,
    settings: {
      unitRate,
      meterCharge,
      propertyName: settings.property_name,
      propertyAddress: settings.property_address,
      currencySymbol: settings.currency_symbol || '৳'
    },
    flats: resultFlats,
    summary: {
      totalFlats: flats.length,
      totalUnits,
      totalElectricity,
      totalHouseRent,
      totalDue,
      totalPayable,
      totalPaid,
      totalOutstanding
    }
  });
});

// POST /api/billing/save-flat (and /api/billing/save-bill)
// Saves or updates a generated monthly bill without affecting payment records
router.post('/save-flat', optionalAuth, (req, res) => {
  const {
    month,
    flat_id,
    current_reading,
    previous_reading,
    house_rent,
    due_amount,
    notes
  } = req.body;

  if (!month || !flat_id) {
    return res.status(400).json({ error: 'Month and flat_id are required' });
  }

  const settings = getSettings();
  const unitRate = parseFloat(settings.unit_rate) || 10;
  const meterCharge = parseFloat(settings.meter_charge) || 60;

  // Retrieve existing payments recorded for this flat
  const currentPaid = getFlatPaymentsSum(month, flat_id);

  const calc = calculateBill({
    currentReading: current_reading,
    previousReading: previous_reading,
    houseRent: house_rent,
    dueAmount: due_amount,
    unitRate,
    meterCharge,
    amountPaid: currentPaid
  });

  const stmt = db.prepare(`
    INSERT INTO billing_records (
      month, flat_id, previous_reading, current_reading, units_used,
      unit_rate, meter_charge, electricity_bill, house_rent, due_amount,
      total_payable, amount_paid, payment_status, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(month, flat_id) DO UPDATE SET
      previous_reading = excluded.previous_reading,
      current_reading = excluded.current_reading,
      units_used = excluded.units_used,
      unit_rate = excluded.unit_rate,
      meter_charge = excluded.meter_charge,
      electricity_bill = excluded.electricity_bill,
      house_rent = excluded.house_rent,
      due_amount = excluded.due_amount,
      total_payable = excluded.total_payable,
      amount_paid = excluded.amount_paid,
      payment_status = excluded.payment_status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    month,
    Number(flat_id),
    calc.previousReading,
    calc.currentReading,
    calc.unitsUsed,
    calc.unitRate,
    calc.meterCharge,
    calc.electricityBill,
    calc.houseRent,
    calc.dueAmount,
    calc.totalPayable,
    currentPaid,
    calc.paymentStatus,
    notes || ''
  );

  const updatedRecord = db.prepare(
    'SELECT * FROM billing_records WHERE month = ? AND flat_id = ?'
  ).get(month, Number(flat_id));

  const payments = db.prepare(
    'SELECT * FROM payment_transactions WHERE month = ? AND flat_id = ? ORDER BY payment_date ASC, id ASC'
  ).all(month, Number(flat_id));

  updatedRecord.remaining_due = Math.max(0, roundCurrency(updatedRecord.total_payable - updatedRecord.amount_paid));
  updatedRecord.payments = payments;

  res.json({
    message: 'Bill saved successfully',
    record: updatedRecord,
    warning: calc.validationWarning
  });
});

// POST /api/billing/save-month
// Bulk saves all flats for a given month
router.post('/save-month', optionalAuth, (req, res) => {
  const { month, flats } = req.body;
  if (!month || !Array.isArray(flats)) {
    return res.status(400).json({ error: 'Valid month and flats array required' });
  }

  const settings = getSettings();
  const unitRate = parseFloat(settings.unit_rate) || 10;
  const meterCharge = parseFloat(settings.meter_charge) || 60;

  const stmt = db.prepare(`
    INSERT INTO billing_records (
      month, flat_id, previous_reading, current_reading, units_used,
      unit_rate, meter_charge, electricity_bill, house_rent, due_amount,
      total_payable, amount_paid, payment_status, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(month, flat_id) DO UPDATE SET
      previous_reading = excluded.previous_reading,
      current_reading = excluded.current_reading,
      units_used = excluded.units_used,
      unit_rate = excluded.unit_rate,
      meter_charge = excluded.meter_charge,
      electricity_bill = excluded.electricity_bill,
      house_rent = excluded.house_rent,
      due_amount = excluded.due_amount,
      total_payable = excluded.total_payable,
      amount_paid = excluded.amount_paid,
      payment_status = excluded.payment_status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  for (const f of flats) {
    const flatId = Number(f.flat_id || f.flat);
    const currentPaid = getFlatPaymentsSum(month, flatId);

    const calc = calculateBill({
      currentReading: f.current_reading !== undefined ? f.current_reading : f.current,
      previousReading: f.previous_reading !== undefined ? f.previous_reading : f.previous,
      houseRent: f.house_rent !== undefined ? f.house_rent : f.rent,
      dueAmount: f.due_amount !== undefined ? f.due_amount : f.due,
      unitRate,
      meterCharge,
      amountPaid: currentPaid
    });

    stmt.run(
      month,
      flatId,
      calc.previousReading,
      calc.currentReading,
      calc.unitsUsed,
      calc.unitRate,
      calc.meterCharge,
      calc.electricityBill,
      calc.houseRent,
      calc.dueAmount,
      calc.totalPayable,
      currentPaid,
      calc.paymentStatus,
      f.notes || ''
    );
  }

  logAudit('SAVE_MONTH', `Saved full monthly bills for month ${month}`, req.user ? req.user.username : 'user');
  res.json({ message: 'Monthly bills saved successfully' });
});

// POST /api/billing/record-payment
// Records an installment or full payment received from a tenant
router.post('/record-payment', optionalAuth, (req, res) => {
  const { month, flat_id, amount, payment_date, payment_method, notes } = req.body;

  if (!month || !flat_id || amount === undefined) {
    return res.status(400).json({ error: 'Month, flat_id, and payment amount are required' });
  }

  const payAmount = roundCurrency(Number(amount));
  if (payAmount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero' });
  }

  const dateStr = payment_date && /^\d{4}-\d{2}-\d{2}$/.test(payment_date)
    ? payment_date
    : new Date().toISOString().split('T')[0];

  const methodStr = payment_method || 'Cash';
  const notesStr = notes ? String(notes).trim() : '';

  // 1. Insert into payment_transactions
  const insertPaymentStmt = db.prepare(`
    INSERT INTO payment_transactions (month, flat_id, amount, payment_date, payment_method, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = insertPaymentStmt.run(month, Number(flat_id), payAmount, dateStr, methodStr, notesStr);

  // 2. Compute updated total paid for this flat
  const totalPaid = getFlatPaymentsSum(month, flat_id);

  // 3. Ensure billing_records has a row for this flat
  let billingRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = ?').get(month, Number(flat_id));
  if (!billingRec) {
    // Generate default record if not generated yet
    const flat = db.prepare('SELECT * FROM flats WHERE id = ?').get(Number(flat_id));
    const prevMonthStr = getPreviousMonth(month);
    const prevRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = ?').get(prevMonthStr, Number(flat_id));

    const prevReading = prevRec ? Number(prevRec.current_reading) || 0 : 0;
    const carriedDue = prevRec ? Math.max(0, roundCurrency(prevRec.total_payable - prevRec.amount_paid)) : 0;
    const rent = flat ? Number(flat.default_rent) || 0 : 0;

    const calc = calculateBill({
      currentReading: prevReading,
      previousReading: prevReading,
      houseRent: rent,
      dueAmount: carriedDue,
      amountPaid: totalPaid
    });

    db.prepare(`
      INSERT INTO billing_records (
        month, flat_id, previous_reading, current_reading, units_used,
        unit_rate, meter_charge, electricity_bill, house_rent, due_amount,
        total_payable, amount_paid, payment_status, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      month, Number(flat_id), calc.previousReading, calc.currentReading, calc.unitsUsed,
      calc.unitRate, calc.meterCharge, calc.electricityBill, calc.houseRent, calc.dueAmount,
      calc.totalPayable, totalPaid, calc.paymentStatus, ''
    );
    billingRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = ?').get(month, Number(flat_id));
  } else {
    // Update existing billing_records
    const totalPayable = Number(billingRec.total_payable) || 0;
    let newStatus = 'UNPAID';
    if (totalPaid >= totalPayable && totalPayable > 0) {
      newStatus = 'PAID';
    } else if (totalPaid > 0 && totalPaid < totalPayable) {
      newStatus = 'PARTIALLY PAID';
    }

    db.prepare(`
      UPDATE billing_records
      SET amount_paid = ?, payment_status = ?, updated_at = datetime('now', 'localtime')
      WHERE month = ? AND flat_id = ?
    `).run(totalPaid, newStatus, month, Number(flat_id));

    billingRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = ?').get(month, Number(flat_id));
  }

  // 4. Retrieve all payments for this flat
  const payments = db.prepare(
    'SELECT * FROM payment_transactions WHERE month = ? AND flat_id = ? ORDER BY payment_date ASC, id ASC'
  ).all(month, Number(flat_id));

  billingRec.remaining_due = Math.max(0, roundCurrency(billingRec.total_payable - billingRec.amount_paid));
  billingRec.payments = payments;

  logAudit(
    'RECORD_PAYMENT',
    `Recorded payment of ৳${payAmount} (${methodStr}) for Flat ${flat_id} in ${month}`,
    req.user ? req.user.username : 'user'
  );

  res.json({
    message: 'Payment recorded successfully',
    transactionId: info.lastInsertRowid,
    record: billingRec,
    payments
  });
});

// DELETE /api/billing/payment/:id
// Reverses/deletes an incorrect payment transaction
router.delete('/payment/:id', optionalAuth, (req, res) => {
  const id = Number(req.params.id);
  const tx = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id);
  if (!tx) {
    return res.status(404).json({ error: 'Payment transaction not found' });
  }

  db.prepare('DELETE FROM payment_transactions WHERE id = ?').run(id);

  // Recalculate total paid
  const totalPaid = getFlatPaymentsSum(tx.month, tx.flat_id);

  const billingRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = ?').get(tx.month, tx.flat_id);
  if (billingRec) {
    const totalPayable = Number(billingRec.total_payable) || 0;
    let newStatus = 'UNPAID';
    if (totalPaid >= totalPayable && totalPayable > 0) {
      newStatus = 'PAID';
    } else if (totalPaid > 0 && totalPaid < totalPayable) {
      newStatus = 'PARTIALLY PAID';
    }

    db.prepare(`
      UPDATE billing_records
      SET amount_paid = ?, payment_status = ?, updated_at = datetime('now', 'localtime')
      WHERE month = ? AND flat_id = ?
    `).run(totalPaid, newStatus, tx.month, tx.flat_id);
  }

  logAudit(
    'DELETE_PAYMENT',
    `Deleted payment ID ${id} of ৳${tx.amount} for Flat ${tx.flat_id} in ${tx.month}`,
    req.user ? req.user.username : 'user'
  );

  const updatedRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = ?').get(tx.month, tx.flat_id);
  const payments = db.prepare(
    'SELECT * FROM payment_transactions WHERE month = ? AND flat_id = ? ORDER BY payment_date ASC, id ASC'
  ).all(tx.month, tx.flat_id);

  if (updatedRec) {
    updatedRec.remaining_due = Math.max(0, roundCurrency(updatedRec.total_payable - updatedRec.amount_paid));
    updatedRec.payments = payments;
  }

  res.json({
    message: 'Payment transaction deleted successfully',
    record: updatedRec,
    payments
  });
});

// GET /api/billing/payment-report/:month
// Comprehensive report of all payment transactions collected in a month
router.get('/payment-report/:month', optionalAuth, (req, res) => {
  const month = req.params.month;
  const rows = db.prepare(`
    SELECT 
      p.*,
      f.flat_name,
      f.tenant_name,
      f.phone
    FROM payment_transactions p
    JOIN flats f ON p.flat_id = f.id
    WHERE p.month = ?
    ORDER BY p.payment_date DESC, p.id DESC
  `).all(month);

  res.json({ month, payments: rows });
});

// GET /api/billing/history
// Returns summary list of all billing months recorded
router.get('/history', optionalAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT 
      month,
      COUNT(flat_id) as total_flats_recorded,
      ROUND(SUM(units_used), 2) as total_units,
      ROUND(SUM(electricity_bill), 2) as total_electricity,
      ROUND(SUM(house_rent), 2) as total_rent,
      ROUND(SUM(due_amount), 2) as total_due,
      ROUND(SUM(total_payable), 2) as total_payable,
      ROUND(SUM(amount_paid), 2) as total_paid,
      ROUND(SUM(total_payable - amount_paid), 2) as total_outstanding,
      MAX(updated_at) as last_updated
    FROM billing_records
    GROUP BY month
    ORDER BY month DESC
  `).all();

  res.json({ history: rows });
});

// GET /api/billing/yearly/:year
// Returns yearly aggregated data for all 12 months
router.get('/yearly/:year', optionalAuth, (req, res) => {
  const year = req.params.year;
  if (!/^\d{4}$/.test(year)) {
    return res.status(400).json({ error: 'Invalid year format. Expected YYYY.' });
  }

  const rows = db.prepare(`
    SELECT 
      b.*,
      f.flat_name,
      f.tenant_name
    FROM billing_records b
    JOIN flats f ON b.flat_id = f.id
    WHERE b.month LIKE ?
    ORDER BY b.month ASC, b.flat_id ASC
  `).all(`${year}-%`);

  res.json({ year, records: rows });
});

// POST /api/billing/migrate-localstorage
// Migrates historical data from client localStorage into SQLite safely
router.post('/migrate-localstorage', optionalAuth, (req, res) => {
  const { data } = req.body;
  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'No data provided for migration' });
  }

  const settings = getSettings();
  const unitRate = parseFloat(settings.unit_rate) || 10;
  const meterCharge = parseFloat(settings.meter_charge) || 60;

  const insertStmt = db.prepare(`
    INSERT INTO billing_records (
      month, flat_id, previous_reading, current_reading, units_used,
      unit_rate, meter_charge, electricity_bill, house_rent, due_amount,
      total_payable, amount_paid, payment_status, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(month, flat_id) DO NOTHING
  `);

  let importedCount = 0;

  for (const item of data) {
    const month = item.month;
    if (!month || !Array.isArray(item.records)) continue;

    for (const r of item.records) {
      const flatId = Number(r.flat || r.flat_id);
      if (!flatId) continue;

      const calc = calculateBill({
        currentReading: r.current || r.current_reading || 0,
        previousReading: r.previous || r.previous_reading || 0,
        houseRent: r.rent || r.house_rent || 0,
        dueAmount: r.due || r.due_amount || 0,
        unitRate,
        meterCharge,
        amountPaid: r.amount_paid || 0
      });

      insertStmt.run(
        month,
        flatId,
        calc.previousReading,
        calc.currentReading,
        calc.unitsUsed,
        calc.unitRate,
        calc.meterCharge,
        calc.electricityBill,
        calc.houseRent,
        calc.dueAmount,
        calc.totalPayable,
        calc.amountPaid,
        calc.paymentStatus,
        'Imported from localStorage'
      );
      importedCount++;
    }
  }

  logAudit('LOCALSTORAGE_MIGRATION', `Migrated ${importedCount} records across ${data.length} months`, 'migration');
  res.json({ message: `Successfully migrated ${importedCount} records.`, importedCount });
});

// GET /api/billing/audit-logs
router.get('/audit-logs', requireAuth, (req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
  res.json({ logs });
});

module.exports = router;
