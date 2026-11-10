const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tazmohal.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for concurrency and durability
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS flats (
    id INTEGER PRIMARY KEY,
    flat_number INTEGER UNIQUE NOT NULL,
    flat_name TEXT NOT NULL,
    tenant_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    default_rent REAL DEFAULT 0,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS billing_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    flat_id INTEGER NOT NULL,
    previous_reading REAL DEFAULT 0,
    current_reading REAL DEFAULT 0,
    units_used REAL DEFAULT 0,
    unit_rate REAL DEFAULT 10,
    meter_charge REAL DEFAULT 60,
    electricity_bill REAL DEFAULT 0,
    house_rent REAL DEFAULT 0,
    due_amount REAL DEFAULT 0,
    total_payable REAL DEFAULT 0,
    amount_paid REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'UNPAID',
    notes TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(month, flat_id),
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    flat_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT DEFAULT 'Cash',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_payments_month_flat ON payment_transactions(month, flat_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    username TEXT DEFAULT 'system'
  );
`);

// Seed default settings if missing
const defaultSettings = [
  { key: 'property_name', value: 'TazMohal-3' },
  { key: 'property_address', value: 'Uttarkhan, Uttara, Dhaka-1230, Bangladesh' },
  { key: 'unit_rate', value: '10' },
  { key: 'meter_charge', value: '60' },
  { key: 'currency_symbol', value: '৳' }
];

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const insertSettingStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

for (const s of defaultSettings) {
  const existing = getSettingStmt.get(s.key);
  if (!existing) {
    insertSettingStmt.run(s.key, s.value);
  }
}

// Seed default flats 1 to 9 if empty
const countFlatsStmt = db.prepare('SELECT COUNT(*) as count FROM flats');
const flatCount = countFlatsStmt.get().count;

if (flatCount === 0) {
  const insertFlatStmt = db.prepare(
    'INSERT INTO flats (id, flat_number, flat_name, tenant_name, phone, default_rent, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (let i = 1; i <= 9; i++) {
    insertFlatStmt.run(i, i, `Flat ${i}`, '', '', 0, '');
  }
}

// Seed default admin user if no users exist
const countUsersStmt = db.prepare('SELECT COUNT(*) as count FROM users');
if (countUsersStmt.get().count === 0) {
  const salt = bcrypt.genSaltSync(10);
  const defaultHash = bcrypt.hashSync('admin123', salt);
  const insertUserStmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
  insertUserStmt.run('admin', defaultHash, 'admin');
  
  const logStmt = db.prepare('INSERT INTO audit_logs (action, details, username) VALUES (?, ?, ?)');
  logStmt.run('SYSTEM_INIT', 'Initial admin account seeded', 'system');
}

// Helper methods
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const r of rows) {
    obj[r.key] = r.value;
  }
  return obj;
}

function updateSetting(key, value) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  stmt.run(key, String(value));
}

function logAudit(action, details, username = 'admin') {
  try {
    const stmt = db.prepare('INSERT INTO audit_logs (action, details, username) VALUES (?, ?, ?)');
    stmt.run(action, details, username);
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

module.exports = {
  db,
  dbPath,
  getSettings,
  updateSetting,
  logAudit
};

