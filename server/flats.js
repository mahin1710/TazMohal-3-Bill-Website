// server/flats.js
const express = require('express');
const router = express.Router();
const { db, logAudit } = require('./db');
const { optionalAuth } = require('./auth');

// GET /api/flats
router.get('/', optionalAuth, (req, res) => {
  const flats = db.prepare('SELECT * FROM flats ORDER BY flat_number ASC').all();
  res.json({ flats });
});

// PUT /api/flats/:id
router.put('/:id', optionalAuth, (req, res) => {
  const id = Number(req.params.id);
  const { tenant_name, phone, default_rent, notes } = req.body;

  const flat = db.prepare('SELECT * FROM flats WHERE id = ?').get(id);
  if (!flat) {
    return res.status(404).json({ error: 'Flat not found' });
  }

  db.prepare(`
    UPDATE flats 
    SET tenant_name = ?, phone = ?, default_rent = ?, notes = ?
    WHERE id = ?
  `).run(
    tenant_name !== undefined ? tenant_name.trim() : flat.tenant_name,
    phone !== undefined ? phone.trim() : flat.phone,
    default_rent !== undefined ? Math.max(0, Number(default_rent) || 0) : flat.default_rent,
    notes !== undefined ? notes.trim() : flat.notes,
    id
  );

  logAudit('UPDATE_FLAT', `Updated metadata for Flat ${flat.flat_number}`, req.user ? req.user.username : 'user');
  const updated = db.prepare('SELECT * FROM flats WHERE id = ?').get(id);
  res.json({ message: 'Flat updated successfully', flat: updated });
});

module.exports = router;

