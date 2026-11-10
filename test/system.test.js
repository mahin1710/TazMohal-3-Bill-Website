// test/system.test.js
// Automated End-to-End System & Security Verification Suite for TazMohal-3

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { calculateBill, roundCurrency } = require('../server/calculator');
const { db, getSettings, updateSetting } = require('../server/db');
const { performBackup } = require('../server/backup');
const bcrypt = require('bcryptjs');

console.log('==================================================');
console.log(' Running TazMohal-3 Verification Test Suite');
console.log('==================================================');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(` ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` ❌ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

// 1. Calculator Tests
test('Calculator: Normal billing calculation with default tariff', () => {
  const result = calculateBill({
    currentReading: 150.50,
    previousReading: 100.25,
    houseRent: 8500,
    dueAmount: 500,
    unitRate: 10,
    meterCharge: 60,
    amountPaid: 0
  });

  assert.strictEqual(result.unitsUsed, 50.25);
  // (50.25 * 10) + 60 = 502.5 + 60 = 562.5
  assert.strictEqual(result.electricityBill, 562.50);
  // 562.5 + 8500 + 500 = 9562.5
  assert.strictEqual(result.totalPayable, 9562.50);
  assert.strictEqual(result.paymentStatus, 'UNPAID');
  assert.strictEqual(result.validationWarning, null);
});

test('Calculator: Inverted readings guard (Current < Previous)', () => {
  const result = calculateBill({
    currentReading: 80,
    previousReading: 100,
    houseRent: 8000,
    dueAmount: 0
  });

  assert.strictEqual(result.unitsUsed, 0);
  assert.strictEqual(result.electricityBill, 60); // base meter charge
  assert(result.validationWarning !== null, 'Warning should be returned for inverted readings');
});

test('Calculator: Payment status tracking (Paid, Partial, Unpaid)', () => {
  const unpaid = calculateBill({ currentReading: 100, previousReading: 100, houseRent: 5000, amountPaid: 0 });
  assert.strictEqual(unpaid.paymentStatus, 'UNPAID');

  const partial = calculateBill({ currentReading: 100, previousReading: 100, houseRent: 5000, amountPaid: 2500 });
  assert.strictEqual(partial.paymentStatus, 'PARTIALLY PAID');

  const paid = calculateBill({ currentReading: 100, previousReading: 100, houseRent: 5000, amountPaid: 5060 });
  assert.strictEqual(paid.paymentStatus, 'PAID');
});

test('Calculator: Currency precision & floating point rounding', () => {
  assert.strictEqual(roundCurrency(0.1 + 0.2), 0.30);
  assert.strictEqual(roundCurrency(1234.567), 1234.57);
});

// 2. Database Tests
test('Database: 9 Flats seeded and structured', () => {
  const flats = db.prepare('SELECT * FROM flats ORDER BY flat_number ASC').all();
  assert.strictEqual(flats.length, 9);
  assert.strictEqual(flats[0].flat_number, 1);
  assert.strictEqual(flats[8].flat_number, 9);
});

test('Database: Default settings configured', () => {
  const settings = getSettings();
  assert.strictEqual(settings.property_name, 'TazMohal-3');
  assert.strictEqual(settings.unit_rate, '10');
  assert.strictEqual(settings.meter_charge, '60');
});

test('Database: Save & update billing record (UPSERT)', () => {
  const testMonth = '1999-01'; // Isolated test month
  const stmt = db.prepare(`
    INSERT INTO billing_records (
      month, flat_id, previous_reading, current_reading, units_used,
      unit_rate, meter_charge, electricity_bill, house_rent, due_amount,
      total_payable, amount_paid, payment_status, notes, updated_at
    ) VALUES (?, 1, 100, 150, 50, 10, 60, 560, 9000, 0, 9560, 9560, 'PAID', 'Test Record', datetime('now'))
    ON CONFLICT(month, flat_id) DO UPDATE SET
      current_reading = excluded.current_reading,
      total_payable = excluded.total_payable
  `);
  stmt.run(testMonth);

  const rec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = 1').get(testMonth);
  assert(rec !== undefined);
  assert.strictEqual(rec.total_payable, 9560);
  assert.strictEqual(rec.payment_status, 'PAID');

  // Clean up test data immediately so production database stays clean
  db.prepare('DELETE FROM billing_records WHERE month = ?').run(testMonth);
});

test('Financial Lifecycle: Automatic Due & Meter Carry-Forward (Jan -> Feb -> March)', () => {
  const m1 = '2099-01';
  const m2 = '2099-02';
  const m3 = '2099-03';

  // 1. Jan: Generate Bill
  const calc1 = calculateBill({ currentReading: 200, previousReading: 100, houseRent: 8000, dueAmount: 0, unitRate: 10, meterCharge: 60 });
  assert.strictEqual(calc1.totalPayable, 9060);

  db.prepare(`
    INSERT INTO billing_records (month, flat_id, previous_reading, current_reading, units_used, unit_rate, meter_charge, electricity_bill, house_rent, due_amount, total_payable, amount_paid, payment_status)
    VALUES (?, 1, 100, 200, 100, 10, 60, 1060, 8000, 0, 9060, 0, 'UNPAID')
  `).run(m1);

  // 2. Jan: Record Partial Payment of ৳6,000
  db.prepare('INSERT INTO payment_transactions (month, flat_id, amount, payment_date, payment_method, notes) VALUES (?, 1, 6000, \'2099-01-15\', \'bKash\', \'Installment 1\')').run(m1);
  db.prepare('UPDATE billing_records SET amount_paid = 6000, payment_status = \'PARTIALLY PAID\' WHERE month = ? AND flat_id = 1').run(m1);

  const janRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = 1').get(m1);
  const janRemainingDue = janRec.total_payable - janRec.amount_paid;
  assert.strictEqual(janRemainingDue, 3060);
  assert.strictEqual(janRec.payment_status, 'PARTIALLY PAID');

  // 3. Feb: Carry forward should retrieve reading=200 and due=3060
  const prevRecForFeb = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = 1').get(m1);
  const febPrevReading = prevRecForFeb.current_reading;
  const febPrevDue = prevRecForFeb.total_payable - prevRecForFeb.amount_paid;
  assert.strictEqual(febPrevReading, 200);
  assert.strictEqual(febPrevDue, 3060);

  // Generate Feb bill: Current=290 (90 units * 10 + 60 = 960), Rent=8000, Due=3060 -> Total = 12020
  const calc2 = calculateBill({ currentReading: 290, previousReading: febPrevReading, houseRent: 8000, dueAmount: febPrevDue, unitRate: 10, meterCharge: 60 });
  assert.strictEqual(calc2.unitsUsed, 90);
  assert.strictEqual(calc2.electricityBill, 960);
  assert.strictEqual(calc2.totalPayable, 12020);

  db.prepare(`
    INSERT INTO billing_records (month, flat_id, previous_reading, current_reading, units_used, unit_rate, meter_charge, electricity_bill, house_rent, due_amount, total_payable, amount_paid, payment_status)
    VALUES (?, 1, ?, 290, ?, 10, 60, ?, 8000, ?, ?, 0, 'UNPAID')
  `).run(m2, calc2.previousReading, calc2.unitsUsed, calc2.electricityBill, calc2.dueAmount, calc2.totalPayable);

  // 4. Feb: Record Multiple Payments: 5000 + 5000 = 10,000
  db.prepare('INSERT INTO payment_transactions (month, flat_id, amount, payment_date, payment_method, notes) VALUES (?, 1, 5000, \'2099-02-05\', \'Cash\', \'Payment 1\')').run(m2);
  db.prepare('INSERT INTO payment_transactions (month, flat_id, amount, payment_date, payment_method, notes) VALUES (?, 1, 5000, \'2099-02-15\', \'Bank Transfer\', \'Payment 2\')').run(m2);
  db.prepare('UPDATE billing_records SET amount_paid = 10000, payment_status = \'PARTIALLY PAID\' WHERE month = ? AND flat_id = 1').run(m2);

  const febRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = 1').get(m2);
  const febRemainingDue = febRec.total_payable - febRec.amount_paid;
  assert.strictEqual(febRemainingDue, 2020);

  // 5. March: Carry forward should retrieve reading=290 and due=2020
  const prevRecForMar = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = 1').get(m2);
  const marPrevReading = prevRecForMar.current_reading;
  const marPrevDue = prevRecForMar.total_payable - prevRecForMar.amount_paid;
  assert.strictEqual(marPrevReading, 290);
  assert.strictEqual(marPrevDue, 2020);

  // Generate March bill: Current=400 (110 units * 10 + 60 = 1160), Rent=8000, Due=2020 -> Total = 11180
  const calc3 = calculateBill({ currentReading: 400, previousReading: marPrevReading, houseRent: 8000, dueAmount: marPrevDue, unitRate: 10, meterCharge: 60 });
  assert.strictEqual(calc3.unitsUsed, 110);
  assert.strictEqual(calc3.electricityBill, 1160);
  assert.strictEqual(calc3.totalPayable, 11180);

  db.prepare(`
    INSERT INTO billing_records (month, flat_id, previous_reading, current_reading, units_used, unit_rate, meter_charge, electricity_bill, house_rent, due_amount, total_payable, amount_paid, payment_status)
    VALUES (?, 1, ?, 400, ?, 10, 60, ?, 8000, ?, ?, 0, 'UNPAID')
  `).run(m3, calc3.previousReading, calc3.unitsUsed, calc3.electricityBill, calc3.dueAmount, calc3.totalPayable);

  // 6. March: Record Full Payment: 11,180
  db.prepare('INSERT INTO payment_transactions (month, flat_id, amount, payment_date, payment_method, notes) VALUES (?, 1, 11180, \'2099-03-10\', \'bKash\', \'Full settlement\')').run(m3);
  db.prepare('UPDATE billing_records SET amount_paid = 11180, payment_status = \'PAID\' WHERE month = ? AND flat_id = 1').run(m3);

  const marRec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = 1').get(m3);
  assert.strictEqual(marRec.total_payable - marRec.amount_paid, 0);
  assert.strictEqual(marRec.payment_status, 'PAID');

  // Verify transaction count in ledger for Feb
  const febTx = db.prepare('SELECT COUNT(*) as count FROM payment_transactions WHERE month = ? AND flat_id = 1').get(m2);
  assert.strictEqual(febTx.count, 2);

  // Cleanup isolated test records
  db.prepare('DELETE FROM billing_records WHERE month IN (?, ?, ?)').run(m1, m2, m3);
  db.prepare('DELETE FROM payment_transactions WHERE month IN (?, ?, ?)').run(m1, m2, m3);
});

// 3. Security Tests
test('Security: Admin account hashed with bcrypt (no plain text)', () => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  assert(user !== undefined);
  assert(user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'));
  assert(bcrypt.compareSync('admin123', user.password_hash));
});

test('Security: .gitignore protects database and backup files', () => {
  const gitignorePath = path.join(__dirname, '../.gitignore');
  assert(fs.existsSync(gitignorePath));
  const content = fs.readFileSync(gitignorePath, 'utf8');
  assert(content.includes('*.sqlite'));
  assert(content.includes('data/'));
  assert(content.includes('backups/'));
  assert(content.includes('.env'));
});

// 4. Backup Tests
test('Backup: Snapshot generation creates valid backup file', () => {
  const backup = performBackup();
  assert(backup.filename.startsWith('tazmohal_backup_'));
  assert(fs.existsSync(path.join(__dirname, '../backups', backup.filename)));
  assert(fs.existsSync(path.join(__dirname, '../backups', backup.jsonFilename)));
});

console.log('==================================================');
console.log(` Summary: ${passedTests} / ${totalTests} Tests Passed successfully!`);
console.log('==================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}

