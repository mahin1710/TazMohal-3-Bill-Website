// server/settings.js
const express = require('express');
const router = express.Router();
const { getSettings, updateSetting, logAudit } = require('./db');
const { optionalAuth } = require('./auth');

// GET /api/settings
router.get('/', optionalAuth, (req, res) => {
  res.json({ settings: getSettings() });
});

// POST /api/settings
router.post('/', optionalAuth, (req, res) => {
  const { unit_rate, meter_charge, property_name, property_address, currency_symbol } = req.body;

  if (unit_rate !== undefined) {
    const rate = Math.max(0, Number(unit_rate));
    updateSetting('unit_rate', rate);
  }

  if (meter_charge !== undefined) {
    const charge = Math.max(0, Number(meter_charge));
    updateSetting('meter_charge', charge);
  }

  if (property_name !== undefined) {
    updateSetting('property_name', String(property_name).trim());
  }

  if (property_address !== undefined) {
    updateSetting('property_address', String(property_address).trim());
  }

  if (currency_symbol !== undefined) {
    updateSetting('currency_symbol', String(currency_symbol).trim());
  }

  logAudit('UPDATE_SETTINGS', 'Updated system billing settings', req.user ? req.user.username : 'user');
  res.json({ message: 'Settings updated successfully', settings: getSettings() });
});

module.exports = router;
