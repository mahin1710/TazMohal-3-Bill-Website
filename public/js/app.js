// public/js/app.js
// Main Billing Dashboard Controller

let currentMonthData = {
  month: '',
  settings: {},
  flats: [],
  summary: {}
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initMonthSelector();
  checkLocalStorageMigration();
  await loadMonthData();
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-mode');
      const newTheme = isDark ? 'light' : 'dark';
      applyTheme(newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }
}

function applyTheme(theme) {
  const toggleBtn = document.getElementById('themeToggle');
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    document.documentElement.setAttribute('data-theme', 'dark');
    if (toggleBtn) toggleBtn.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    document.documentElement.setAttribute('data-theme', 'light');
    if (toggleBtn) toggleBtn.textContent = '🌙';
  }
}

// Month Selector Management
function initMonthSelector() {
  const selector = document.getElementById('monthSelector');
  if (!selector) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  selector.value = `${y}-${m}`;

  selector.addEventListener('change', async () => {
    await loadMonthData();
  });
}

// Check for legacy localStorage data to offer one-click migration
function checkLocalStorageMigration() {
  const legacyMonths = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('rent_')) {
      const month = key.replace('rent_', '');
      legacyMonths.push(month);
    }
  }

  if (legacyMonths.length > 0) {
    const banner = document.getElementById('migrationBanner');
    const msg = document.getElementById('migrationMsg');
    if (banner && msg) {
      msg.textContent = `Found ${legacyMonths.length} month(s) of historical billing data in browser storage (${legacyMonths.join(', ')}).`;
      banner.style.display = 'flex';
    }
  }
}

async function runLocalStorageMigration() {
  const payload = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('rent_')) {
      const month = key.replace('rent_', '');
      try {
        const records = JSON.parse(localStorage.getItem(key));
        payload.push({ month, records });
      } catch (e) {
        console.error('Failed to parse localStorage key:', key);
      }
    }
  }

  if (payload.length === 0) return;

  try {
    const res = await API.migrateLocalStorage(payload);
    alert(`Success! ${res.importedCount} historical records migrated into SQLite database.`);
    document.getElementById('migrationBanner').style.display = 'none';
    await loadMonthData();
  } catch (err) {
    alert('Migration failed: ' + err.message);
  }
}

// Load month data from API
async function loadMonthData() {
  const selector = document.getElementById('monthSelector');
  const month = selector.value;
  if (!month) return;

  API.setSaveStatus('saving');
  try {
    const data = await API.getMonthBilling(month);
    currentMonthData = data;
    renderMetrics(data.summary, data.settings);
    renderFlatCards(data.flats, data.settings);
    API.setSaveStatus('saved');
  } catch (err) {
    console.error('Failed to load month data:', err);
    API.setSaveStatus('error', 'Load failed');
    renderOfflineFallback(month);
  }
}

// Render Top Summary Metrics
function renderMetrics(summary = {}, settings = {}) {
  const sym = settings.currencySymbol || '৳';
  document.getElementById('metricTotalRent').textContent = `${sym} ${(summary.totalHouseRent || 0).toFixed(2)}`;
  document.getElementById('metricTotalElec').textContent = `${sym} ${(summary.totalElectricity || 0).toFixed(2)}`;
  document.getElementById('metricTotalPayable').textContent = `${sym} ${(summary.totalPayable || 0).toFixed(2)}`;
  document.getElementById('metricTotalPaid').textContent = `${sym} ${(summary.totalPaid || 0).toFixed(2)}`;
  document.getElementById('metricTotalDue').textContent = `${sym} ${(summary.totalOutstanding || 0).toFixed(2)}`;
}

// Render 9 Flat Cards
function renderFlatCards(flats, settings) {
  const grid = document.getElementById('flatGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const unitRate = Number(settings.unitRate) || 10;
  const meterCharge = Number(settings.meterCharge) || 60;
  const sym = settings.currencySymbol || '৳';

  flats.forEach(flat => {
    const card = document.createElement('div');
    card.className = 'flat-card';
    card.id = `flat-card-${flat.flat_id}`;
    card.dataset.flatId = flat.flat_id;

    const units = Math.max(0, flat.current_reading - flat.previous_reading);
    const elecBill = (units * unitRate) + meterCharge;
    const total = elecBill + (Number(flat.house_rent) || 0) + (Number(flat.due_amount) || 0);
    const paid = Number(flat.amount_paid) || 0;

    let status = flat.payment_status || 'Unpaid';
    if (paid >= total && total > 0) status = 'Paid';
    else if (paid > 0 && paid < total) status = 'Partial';

    card.innerHTML = `
      <div class="flat-card-header">
        <div class="flat-card-title">
          <h3>${flat.flat_name || `Flat ${flat.flat_number}`}</h3>
          ${flat.tenant_name ? `<span class="tenant-badge">👤 ${flat.tenant_name}</span>` : ''}
        </div>
        <span class="status-badge ${status.toLowerCase()}" id="status-badge-${flat.flat_id}">${status}</span>
      </div>

      <div class="input-group-grid">
        <div class="input-field">
          <label>Current Meter Reading</label>
          <input type="number" step="0.01" class="input-curr" value="${flat.current_reading || ''}" placeholder="0.00" />
        </div>
        <div class="input-field">
          <label>Previous Meter Reading</label>
          <input type="number" step="0.01" class="input-prev" value="${flat.previous_reading || ''}" placeholder="0.00" />
        </div>
        <div class="calc-warning" id="warning-${flat.flat_id}">Current reading is less than previous!</div>

        <div class="input-field">
          <label>House Rent (${sym})</label>
          <input type="number" step="1" class="input-rent" value="${flat.house_rent || ''}" placeholder="0" />
        </div>
        <div class="input-field">
          <label>Previous Due (${sym})</label>
          <input type="number" step="1" class="input-due" value="${flat.due_amount || ''}" placeholder="0" />
        </div>

        <div class="input-field">
          <label>Amount Paid (${sym})</label>
          <input type="number" step="1" class="input-paid" value="${flat.amount_paid || ''}" placeholder="0" />
        </div>
        <div class="input-field">
          <label>Notes / Memo</label>
          <input type="text" class="input-notes" value="${flat.notes || ''}" placeholder="Optional notes" />
        </div>
      </div>

      <div class="bill-summary-box">
        <div class="summary-row">
          <span>Units Consumed:</span>
          <strong id="units-val-${flat.flat_id}">${units.toFixed(2)} units</strong>
        </div>
        <div class="summary-row">
          <span>Electricity Bill:</span>
          <strong id="elec-val-${flat.flat_id}">${sym} ${elecBill.toFixed(2)}</strong>
        </div>
        <div class="summary-row total-row">
          <span>Total Payable:</span>
          <span class="total-amount" id="total-val-${flat.flat_id}">${sym} ${total.toFixed(2)}</span>
        </div>
        <div class="summary-row" style="font-size: 0.8rem; margin-top: 4px;">
          <span>Outstanding Due:</span>
          <strong id="due-val-${flat.flat_id}">${sym} ${(total - paid).toFixed(2)}</strong>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
        <button class="btn btn-outline" style="font-size: 0.78rem; padding: 4px 8px;" onclick="printFlatReceipt(${flat.flat_id})">
          🖨️ Receipt
        </button>
      </div>
    `;

    // Attach real-time input listeners
    attachInputListeners(card, flat.flat_id);
    grid.appendChild(card);
  });
}

// Attach debounced auto-save on input changes
function attachInputListeners(card, flatId) {
  const currInput = card.querySelector('.input-curr');
  const prevInput = card.querySelector('.input-prev');
  const rentInput = card.querySelector('.input-rent');
  const dueInput = card.querySelector('.input-due');
  const paidInput = card.querySelector('.input-paid');
  const notesInput = card.querySelector('.input-notes');

  const inputs = [currInput, prevInput, rentInput, dueInput, paidInput, notesInput];

  inputs.forEach(input => {
    input.addEventListener('input', () => {
      recalcFlatCard(card, flatId);
      triggerAutoSave(card, flatId);
    });
  });
}

// Instant client-side calculation preview
function recalcFlatCard(card, flatId) {
  const curr = parseFloat(card.querySelector('.input-curr').value) || 0;
  const prev = parseFloat(card.querySelector('.input-prev').value) || 0;
  const rent = parseFloat(card.querySelector('.input-rent').value) || 0;
  const due = parseFloat(card.querySelector('.input-due').value) || 0;
  const paid = parseFloat(card.querySelector('.input-paid').value) || 0;

  const unitRate = Number(currentMonthData.settings.unitRate) || 10;
  const meterCharge = Number(currentMonthData.settings.meterCharge) || 60;
  const sym = currentMonthData.settings.currencySymbol || '৳';

  const warningEl = card.querySelector(`#warning-${flatId}`);
  let units = 0;
  if (curr < prev) {
    if (warningEl) warningEl.classList.add('visible');
    units = 0;
  } else {
    if (warningEl) warningEl.classList.remove('visible');
    units = curr - prev;
  }

  const elecBill = (units * unitRate) + meterCharge;
  const total = elecBill + rent + due;
  const outstanding = total - paid;

  let status = 'Unpaid';
  if (paid >= total && total > 0) status = 'Paid';
  else if (paid > 0 && paid < total) status = 'Partial';

  card.querySelector(`#units-val-${flatId}`).textContent = `${units.toFixed(2)} units`;
  card.querySelector(`#elec-val-${flatId}`).textContent = `${sym} ${elecBill.toFixed(2)}`;
  card.querySelector(`#total-val-${flatId}`).textContent = `${sym} ${total.toFixed(2)}`;
  card.querySelector(`#due-val-${flatId}`).textContent = `${sym} ${outstanding.toFixed(2)}`;

  const badge = card.querySelector(`#status-badge-${flatId}`);
  if (badge) {
    badge.className = `status-badge ${status.toLowerCase()}`;
    badge.textContent = status;
  }

  // Update in-memory flat object
  const flatObj = currentMonthData.flats.find(f => f.flat_id === flatId);
  if (flatObj) {
    flatObj.current_reading = curr;
    flatObj.previous_reading = prev;
    flatObj.units_used = units;
    flatObj.electricity_bill = elecBill;
    flatObj.house_rent = rent;
    flatObj.due_amount = due;
    flatObj.total_payable = total;
    flatObj.amount_paid = paid;
    flatObj.payment_status = status;
    flatObj.notes = card.querySelector('.input-notes').value || '';
  }

  recalcOverallSummary();
}

function recalcOverallSummary() {
  let sumRent = 0, sumElec = 0, sumTotal = 0, sumPaid = 0;
  currentMonthData.flats.forEach(f => {
    sumRent += Number(f.house_rent) || 0;
    sumElec += Number(f.electricity_bill) || 0;
    sumTotal += Number(f.total_payable) || 0;
    sumPaid += Number(f.amount_paid) || 0;
  });

  const summary = {
    totalHouseRent: sumRent,
    totalElectricity: sumElec,
    totalPayable: sumTotal,
    totalPaid: sumPaid,
    totalOutstanding: sumTotal - sumPaid
  };
  currentMonthData.summary = summary;
  renderMetrics(summary, currentMonthData.settings);
}

// Trigger debounced auto-save
function triggerAutoSave(card, flatId) {
  const month = document.getElementById('monthSelector').value;
  const curr = parseFloat(card.querySelector('.input-curr').value) || 0;
  const prev = parseFloat(card.querySelector('.input-prev').value) || 0;
  const rent = parseFloat(card.querySelector('.input-rent').value) || 0;
  const due = parseFloat(card.querySelector('.input-due').value) || 0;
  const paid = parseFloat(card.querySelector('.input-paid').value) || 0;
  const notes = card.querySelector('.input-notes').value || '';

  const payload = {
    month,
    flat_id: flatId,
    current_reading: curr,
    previous_reading: prev,
    house_rent: rent,
    due_amount: due,
    amount_paid: paid,
    notes
  };

  API.queueAutoSaveFlat(payload, (res) => {
    // Also update localStorage as local safety mirror
    try {
      localStorage.setItem(`rent_${month}`, JSON.stringify(currentMonthData.flats));
    } catch (e) {}
  });
}

// Calculate All button handler
function calculateAll() {
  const cards = document.querySelectorAll('.flat-card');
  cards.forEach(card => {
    const flatId = Number(card.dataset.flatId);
    recalcFlatCard(card, flatId);
    triggerAutoSave(card, flatId);
  });
  alert('All flat calculations refreshed and saved!');
}

// Save All button handler
async function saveAllData() {
  const month = document.getElementById('monthSelector').value;
  try {
    await API.saveEntireMonth(month, currentMonthData.flats);
    alert('All monthly records saved successfully into database!');
  } catch (err) {
    alert('Failed to save month: ' + err.message);
  }
}

// Export Monthly Excel
function downloadMonthlyExcel() {
  const month = document.getElementById('monthSelector').value;
  Reports.downloadMonthlyExcel(month, currentMonthData.flats, currentMonthData.settings);
}

// Print single flat receipt
function printFlatReceipt(flatId) {
  const month = document.getElementById('monthSelector').value;
  const flat = currentMonthData.flats.find(f => f.flat_id === flatId);
  if (flat) {
    Reports.printSingleInvoice(flat, month, currentMonthData.settings);
  }
}

// Fallback if backend server is not running (reads from localStorage)
function renderOfflineFallback(month) {
  const localData = JSON.parse(localStorage.getItem(`rent_${month}`)) || [];
  const dummyFlats = [];
  for (let i = 1; i <= 9; i++) {
    const found = localData.find(d => Number(d.flat || d.flat_id) === i) || {};
    dummyFlats.push({
      flat_id: i,
      flat_number: i,
      flat_name: `Flat ${i}`,
      tenant_name: found.tenant_name || '',
      current_reading: found.current || found.current_reading || 0,
      previous_reading: found.previous || found.previous_reading || 0,
      house_rent: found.rent || found.house_rent || 0,
      due_amount: found.due || found.due_amount || 0,
      amount_paid: found.amount_paid || 0,
      notes: found.notes || ''
    });
  }
  currentMonthData = {
    month,
    settings: { unitRate: 10, meterCharge: 60, currencySymbol: '৳' },
    flats: dummyFlats,
    summary: {}
  };
  renderFlatCards(dummyFlats, currentMonthData.settings);
  recalcOverallSummary();
}

