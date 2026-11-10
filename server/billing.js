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

// GET /api/billing/month/:month
// Returns records for all 9 flats for the given month, auto-filling defaults
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

  // Get previous month records (to auto-fill previous readings if not set)
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

    if (!rec) {
      // Auto-suggest previous reading from previous month's current reading
      const prevRec = prevRecordMap.get(flat.id);
      const suggestedPrevious = prevRec ? prevRec.current_reading : 0;
      const defaultRent = flat.default_rent || 0;

      const calc = calculateBill({
        currentReading: suggestedPrevious,
        previousReading: suggestedPrevious,
        houseRent: defaultRent,
        dueAmount: 0,
        unitRate,
        meterCharge,
        amountPaid: 0
      });

      rec = {
        id: null,
        month,
        flat_id: flat.id,
        flat_number: flat.flat_number,
        flat_name: flat.flat_name,
        tenant_name: flat.tenant_name,
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
        amount_paid: calc.amountPaid,
        payment_status: calc.paymentStatus,
        notes: flat.notes || '',
        updated_at: null,
        is_saved: false
      };
    } else {
      rec.flat_number = flat.flat_number;
      rec.flat_name = flat.flat_name;
      rec.tenant_name = flat.tenant_name;
      rec.phone = flat.phone;
      rec.is_saved = true;
    }

    totalUnits = roundCurrency(totalUnits + rec.units_used);
    totalElectricity = roundCurrency(totalElectricity + rec.electricity_bill);
    totalHouseRent = roundCurrency(totalHouseRent + rec.house_rent);
    totalDue = roundCurrency(totalDue + rec.due_amount);
    totalPayable = roundCurrency(totalPayable + rec.total_payable);
    totalPaid = roundCurrency(totalPaid + rec.amount_paid);

    resultFlats.push(rec);
  }

  const totalOutstanding = roundCurrency(totalPayable - totalPaid);

  res.json({
    month,
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

// POST /api/billing/save-flat
// Real-time live auto-save endpoint for a single flat
router.post('/save-flat', optionalAuth, (req, res) => {
  const {
    month,
    flat_id,
    current_reading,
    previous_reading,
    house_rent,
    due_amount,
    amount_paid,
    notes
  } = req.body;

  if (!month || !flat_id) {
    return res.status(400).json({ error: 'Month and flat_id are required' });
  }

  const settings = getSettings();
  const unitRate = parseFloat(settings.unit_rate) || 10;
  const meterCharge = parseFloat(settings.meter_charge) || 60;

  const calc = calculateBill({
    currentReading: current_reading,
    previousReading: previous_reading,
    houseRent: house_rent,
    dueAmount: due_amount,
    unitRate,
    meterCharge,
    amountPaid: amount_paid
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
    calc.amountPaid,
    calc.paymentStatus,
    notes || ''
  );

  const updatedRecord = db.prepare(
    'SELECT * FROM billing_records WHERE month = ? AND flat_id = ?'
  ).get(month, Number(flat_id));

  res.json({
    message: 'Saved successfully',
    record: updatedRecord,
    warning: calc.validationWarning
  });
});

// POST /api/billing/save-month
// Bulk save for all flats in a month
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
    const calc = calculateBill({
      currentReading: f.current_reading !== undefined ? f.current_reading : f.current,
      previousReading: f.previous_reading !== undefined ? f.previous_reading : f.previous,
      houseRent: f.house_rent !== undefined ? f.house_rent : f.rent,
      dueAmount: f.due_amount !== undefined ? f.due_amount : f.due,
      unitRate,
      meterCharge,
      amountPaid: f.amount_paid || 0
    });

    stmt.run(
      month,
      Number(f.flat_id || f.flat),
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
      f.notes || ''
    );
  }

  logAudit('SAVE_MONTH', `Saved full billing data for month ${month}`, req.user ? req.user.username : 'user');
  res.json({ message: 'Month saved successfully' });
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
  const { data } = req.body; // Array of { month: '2026-06', records: [ { flat: 1, current, previous, rent, due, ... } ] }
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

