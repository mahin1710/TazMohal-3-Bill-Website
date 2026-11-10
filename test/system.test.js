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
  assert.strictEqual(result.paymentStatus, 'Unpaid');
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
  assert.strictEqual(unpaid.paymentStatus, 'Unpaid');

  const partial = calculateBill({ currentReading: 100, previousReading: 100, houseRent: 5000, amountPaid: 2500 });
  assert.strictEqual(partial.paymentStatus, 'Partial');

  const paid = calculateBill({ currentReading: 100, previousReading: 100, houseRent: 5000, amountPaid: 5060 });
  assert.strictEqual(paid.paymentStatus, 'Paid');
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
  const testMonth = '2026-11';
  const stmt = db.prepare(`
    INSERT INTO billing_records (
      month, flat_id, previous_reading, current_reading, units_used,
      unit_rate, meter_charge, electricity_bill, house_rent, due_amount,
      total_payable, amount_paid, payment_status, notes, updated_at
    ) VALUES (?, 1, 100, 150, 50, 10, 60, 560, 9000, 0, 9560, 9560, 'Paid', 'Test Record', datetime('now'))
    ON CONFLICT(month, flat_id) DO UPDATE SET
      current_reading = excluded.current_reading,
      total_payable = excluded.total_payable
  `);
  stmt.run(testMonth);

  const rec = db.prepare('SELECT * FROM billing_records WHERE month = ? AND flat_id = 1').get(testMonth);
  assert(rec !== undefined);
  assert.strictEqual(rec.total_payable, 9560);
  assert.strictEqual(rec.payment_status, 'Paid');
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

