// server/backup.js
const express = require('express');
const router = express.Router();
const fs = require('node:fs');
const path = require('node:path');
const { db, dbPath, logAudit } = require('./db');
const { optionalAuth } = require('./auth');

const backupsDir = path.join(__dirname, '../backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

function createTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// Function to create a snapshot
function performBackup() {
  const ts = createTimestamp();
  const filename = `tazmohal_backup_${ts}.sqlite`;
  const destPath = path.join(backupsDir, filename);

  // Use SQLite checkpoint to flush WAL before copying
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (e) {
    // checkpoint fallback
  }

  fs.copyFileSync(dbPath, destPath);

  // Also create a JSON dump for human-readable portability
  const jsonDump = {
    timestamp: new Date().toISOString(),
    settings: db.prepare('SELECT * FROM settings').all(),
    flats: db.prepare('SELECT * FROM flats').all(),
    billing_records: db.prepare('SELECT * FROM billing_records').all(),
    audit_logs: db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500').all()
  };
  const jsonFilename = `tazmohal_backup_${ts}.json`;
  fs.writeFileSync(path.join(backupsDir, jsonFilename), JSON.stringify(jsonDump, null, 2), 'utf8');

  logAudit('BACKUP_CREATED', `Created backup files ${filename} and ${jsonFilename}`, 'system');
  return { filename, jsonFilename, timestamp: ts };
}

// GET /api/backup/list
router.get('/list', optionalAuth, (req, res) => {
  try {
    const files = fs.readdirSync(backupsDir);
    const backupList = files.map(file => {
      const stats = fs.statSync(path.join(backupsDir, file));
      return {
        filename: file,
        size: stats.size,
        createdAt: stats.mtime,
        type: file.endsWith('.json') ? 'json' : 'sqlite'
      };
    }).sort((a, b) => b.createdAt - a.createdAt);

    res.json({ backups: backupList });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list backups: ' + err.message });
  }
});

// POST /api/backup/create
router.post('/create', optionalAuth, (req, res) => {
  try {
    const result = performBackup();
    res.json({ message: 'Backup created successfully', ...result });
  } catch (err) {
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

// GET /api/backup/download/:filename
router.get('/download/:filename', optionalAuth, (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(backupsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  res.download(filePath, safeFilename);
});

// GET /api/backup/export-json
router.get('/export-json', optionalAuth, (req, res) => {
  const exportData = {
    exportedAt: new Date().toISOString(),
    property: 'TazMohal-3',
    settings: db.prepare('SELECT * FROM settings').all(),
    flats: db.prepare('SELECT * FROM flats').all(),
    billing_records: db.prepare('SELECT * FROM billing_records ORDER BY month DESC, flat_id ASC').all()
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=tazmohal_export_${Date.now()}.json`);
  res.send(JSON.stringify(exportData, null, 2));
});

// POST /api/backup/restore
router.post('/restore', optionalAuth, (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const safeFilename = path.basename(filename);
  const targetPath = path.join(backupsDir, safeFilename);

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  try {
    // 1. Always create a pre-restore checkpoint backup first!
    const preRestore = performBackup();

    if (safeFilename.endsWith('.json')) {
      // Restore from JSON dump
      const content = fs.readFileSync(targetPath, 'utf8');
      const data = JSON.parse(content);

      if (data.settings && Array.isArray(data.settings)) {
        const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
        for (const s of data.settings) stmt.run(s.key, s.value, s.updated_at || new Date().toISOString());
      }

      if (data.flats && Array.isArray(data.flats)) {
        const stmt = db.prepare('INSERT OR REPLACE INTO flats (id, flat_number, flat_name, tenant_name, phone, default_rent, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const f of data.flats) stmt.run(f.id, f.flat_number, f.flat_name, f.tenant_name || '', f.phone || '', f.default_rent || 0, f.notes || '');
      }

      if (data.billing_records && Array.isArray(data.billing_records)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO billing_records (
            id, month, flat_id, previous_reading, current_reading, units_used,
            unit_rate, meter_charge, electricity_bill, house_rent, due_amount,
            total_payable, amount_paid, payment_status, notes, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of data.billing_records) {
          stmt.run(
            b.id || null, b.month, b.flat_id, b.previous_reading || 0, b.current_reading || 0,
            b.units_used || 0, b.unit_rate || 10, b.meter_charge || 60, b.electricity_bill || 0,
            b.house_rent || 0, b.due_amount || 0, b.total_payable || 0, b.amount_paid || 0,
            b.payment_status || 'Unpaid', b.notes || '', b.updated_at || new Date().toISOString()
          );
        }
      }

      logAudit('RESTORE_JSON', `Restored database state from ${safeFilename}`, 'admin');
      res.json({ message: 'JSON backup restored successfully', safetyBackup: preRestore.filename });
    } else if (safeFilename.endsWith('.sqlite')) {
      // SQLite snapshot replacement
      fs.copyFileSync(targetPath, dbPath);
      logAudit('RESTORE_SQLITE', `Restored database file from ${safeFilename}`, 'admin');
      res.json({ message: 'SQLite snapshot restored successfully', safetyBackup: preRestore.filename });
    } else {
      res.status(400).json({ error: 'Unsupported backup format' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

module.exports = {
  router,
  performBackup
};

