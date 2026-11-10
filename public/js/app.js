// public/js/app.js
// TazMohal-3 Clean & Minimalist Billing Dashboard Controller

let currentMonthData = {
  month: '',
  prevMonth: '',
  settings: {},
  flats: [],
  summary: {}
};

let currentWorkflowMode = 'pay'; // 'pay' (Pay Bill) or 'paid' (Paid Bill)

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

// Clean Top Workflow Mode Switcher
function switchWorkflowMode(mode) {
  currentWorkflowMode = mode;
  const tabPay = document.getElementById('tabPayBill');
  const tabPaid = document.getElementById('tabPaidBill');
  if (tabPay) tabPay.classList.toggle('active', mode === 'pay');
  if (tabPaid) tabPaid.classList.toggle('active', mode === 'paid');

  // Toggle all cards smoothly
  document.querySelectorAll('.flat-card').forEach(card => {
    const flatId = Number(card.dataset.flatId);
    const payView = card.querySelector(`#pay-view-${flatId}`);
    const paidView = card.querySelector(`#paid-view-${flatId}`);
    if (payView && paidView) {
      payView.style.display = mode === 'pay' ? 'block' : 'none';
      paidView.style.display = mode === 'paid' ? 'block' : 'none';
    }
  });
}

// Check for legacy localStorage data
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
      msg.textContent = `Found ${legacyMonths.length} month(s) of historical data in browser storage.`;
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
      } catch (e) {}
    }
  }

  if (payload.length === 0) return;

  try {
    const res = await API.migrateLocalStorage(payload);
    alert(`Success! ${res.importedCount} historical records migrated into database.`);
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

// Render Clean Flat Cards
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
    const remainingDue = Math.max(0, total - paid);

    let status = flat.payment_status || 'UNPAID';
    if (paid >= total && total > 0) status = 'PAID';
    else if (paid > 0 && paid < total) status = 'PARTIALLY PAID';
    else if (paid === 0) status = flat.is_saved ? 'UNPAID' : 'BILL GENERATED';

    const statusClass = status.toLowerCase().replace(/\s+/g, '-');

    // Build compact payment tags
    const payments = flat.payments || [];
    let paymentsHtml = '';
    if (payments.length > 0) {
      paymentsHtml = payments.map(p => `
        <div class="payment-tag">
          <span>${p.payment_date} • <strong>${sym} ${Number(p.amount).toFixed(2)}</strong> [${p.payment_method}] ${p.notes ? `<em>"${p.notes}"</em>` : ''}</span>
          <button class="del-btn" title="Delete payment" onclick="deleteFlatPayment(${p.id}, ${flat.flat_id})">✕</button>
        </div>
      `).join('');
    } else {
      paymentsHtml = '<div style="font-size:0.78rem; color:var(--text-muted); text-align:center; padding:4px;">No payments recorded for this month.</div>';
    }

    card.innerHTML = `
      <!-- Clean Card Header -->
      <div class="flat-card-header">
        <div class="flat-card-title">
          <h3>${flat.flat_name || `Flat ${flat.flat_number}`}</h3>
          ${flat.tenant_name ? `<span class="tenant-badge">👤 ${flat.tenant_name}</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="status-badge ${statusClass}" id="status-badge-${flat.flat_id}">${status}</span>
          <button class="btn-icon-sm" title="Print Tenant Receipt" onclick="printFlatReceipt(${flat.flat_id})">🖨️</button>
        </div>
      </div>

      <!-- VIEW 1: PAY BILL (Generate & Calculate) -->
      <div class="pay-bill-view" id="pay-view-${flat.flat_id}" style="display: ${currentWorkflowMode === 'pay' ? 'block' : 'none'};">
        <div class="input-group-grid">
          <div class="input-field">
            <label>Current Reading</label>
            <input type="number" step="0.01" class="input-curr" value="${flat.current_reading || ''}" placeholder="0.00" />
          </div>
          <div class="input-field">
            <label>
              Previous Reading
              ${flat.carried_from_prev_month ? `<span class="badge-carried" title="Auto-retrieved from previous month">🔄 Carried</span>` : ''}
            </label>
            <input type="number" step="0.01" class="input-prev" value="${flat.previous_reading || ''}" placeholder="0.00" />
          </div>
          <div class="calc-warning full-width" id="warning-${flat.flat_id}">Current reading is less than previous!</div>

          <div class="input-field">
            <label>House Rent (${sym})</label>
            <input type="number" step="1" class="input-rent" value="${flat.house_rent || ''}" placeholder="0" />
          </div>
          <div class="input-field">
            <label>
              Carried Due (${sym})
              ${flat.prev_month_due > 0 ? `<span class="badge-carried" title="Unpaid balance from previous month">🔄 Due: ${sym}${flat.prev_month_due}</span>` : ''}
            </label>
            <input type="number" step="1" class="input-due" value="${flat.due_amount || ''}" placeholder="0" />
          </div>
          
          <div class="input-field full-width">
            <label>Notes / Remarks</label>
            <textarea class="input-notes" rows="1" placeholder="Optional notes...">${flat.notes || ''}</textarea>
          </div>
        </div>

        <div class="clean-bill-summary">
          <span>Units: <strong id="units-val-${flat.flat_id}">${units.toFixed(2)}</strong> (${sym} ${elecBill.toFixed(2)})</span>
          <span>Total Bill: <strong style="font-size:1.15rem; color:var(--primary);" id="total-val-${flat.flat_id}">${sym} ${total.toFixed(2)}</strong></span>
        </div>
      </div>

      <!-- VIEW 2: PAID BILL (Record Payments & Ledger) -->
      <div class="paid-bill-view" id="paid-view-${flat.flat_id}" style="display: ${currentWorkflowMode === 'paid' ? 'block' : 'none'};">
        <!-- Clean Inline Stats -->
        <div class="paid-stats-row">
          <div class="stat-col">
            <span class="lbl">Total Bill</span>
            <span class="num" id="paid-tot-${flat.flat_id}">${sym} ${total.toFixed(2)}</span>
          </div>
          <div class="stat-col">
            <span class="lbl">Total Paid</span>
            <span class="num green" id="paid-sum-${flat.flat_id}">${sym} ${paid.toFixed(2)}</span>
          </div>
          <div class="stat-col">
            <span class="lbl">Remaining</span>
            <span class="num ${remainingDue > 0 ? 'red' : 'green'}" id="paid-rem-${flat.flat_id}">${sym} ${remainingDue.toFixed(2)}</span>
          </div>
        </div>

        <!-- Clean 1-Row Payment Entry -->
        <div class="inline-pay-row">
          <input type="number" step="1" id="pay-amt-${flat.flat_id}" placeholder="৳ Amount Received" />
          <select id="pay-method-${flat.flat_id}">
            <option value="Cash">Cash</option>
            <option value="bKash">bKash</option>
            <option value="Nagad">Nagad</option>
            <option value="Rocket">Rocket</option>
            <option value="Bank">Bank</option>
            <option value="Other">Other</option>
          </select>
          <button class="btn btn-success" onclick="recordFlatPayment(${flat.flat_id})">+ Pay</button>
        </div>

        <!-- Compact Payment History Tags -->
        <div class="payment-tags-wrap" id="payment-list-${flat.flat_id}">
          ${paymentsHtml}
        </div>
      </div>
    `;

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
  const notesInput = card.querySelector('.input-notes');

  const inputs = [currInput, prevInput, rentInput, dueInput, notesInput];

  inputs.forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        recalcFlatCard(card, flatId);
        triggerAutoSave(card, flatId);
      });
    }
  });
}

// Instant client-side calculation preview
function recalcFlatCard(card, flatId) {
  const curr = parseFloat(card.querySelector('.input-curr').value) || 0;
  const prev = parseFloat(card.querySelector('.input-prev').value) || 0;
  const rent = parseFloat(card.querySelector('.input-rent').value) || 0;
  const due = parseFloat(card.querySelector('.input-due').value) || 0;

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

  const flatObj = currentMonthData.flats.find(f => f.flat_id === flatId);
  const paid = flatObj ? Number(flatObj.amount_paid) || 0 : 0;
  const remainingDue = Math.max(0, total - paid);

  let status = 'UNPAID';
  if (paid >= total && total > 0) status = 'PAID';
  else if (paid > 0 && paid < total) status = 'PARTIALLY PAID';

  // Update Pay Bill view elements
  card.querySelector(`#units-val-${flatId}`).textContent = `${units.toFixed(2)}`;
  card.querySelector(`#total-val-${flatId}`).textContent = `${sym} ${total.toFixed(2)}`;

  // Update Paid Bill view elements
  const paidTot = card.querySelector(`#paid-tot-${flatId}`);
  const paidRem = card.querySelector(`#paid-rem-${flatId}`);
  if (paidTot) paidTot.textContent = `${sym} ${total.toFixed(2)}`;
  if (paidRem) {
    paidRem.textContent = `${sym} ${remainingDue.toFixed(2)}`;
    paidRem.className = `num ${remainingDue > 0 ? 'red' : 'green'}`;
  }

  const badge = card.querySelector(`#status-badge-${flatId}`);
  if (badge) {
    const statusClass = status.toLowerCase().replace(/\s+/g, '-');
    badge.className = `status-badge ${statusClass}`;
    badge.textContent = status;
  }

  if (flatObj) {
    flatObj.current_reading = curr;
    flatObj.previous_reading = prev;
    flatObj.units_used = units;
    flatObj.electricity_bill = elecBill;
    flatObj.house_rent = rent;
    flatObj.due_amount = due;
    flatObj.total_payable = total;
    flatObj.remaining_due = remainingDue;
    flatObj.payment_status = status;
    const notesEl = card.querySelector('.input-notes');
    if (notesEl) flatObj.notes = notesEl.value;
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
    totalOutstanding: Math.max(0, sumTotal - sumPaid)
  };
  currentMonthData.summary = summary;
  renderMetrics(summary, currentMonthData.settings);
}

// Debounced auto-save for Pay Bill
function triggerAutoSave(card, flatId) {
  const month = document.getElementById('monthSelector').value;
  const curr = parseFloat(card.querySelector('.input-curr').value) || 0;
  const prev = parseFloat(card.querySelector('.input-prev').value) || 0;
  const rent = parseFloat(card.querySelector('.input-rent').value) || 0;
  const due = parseFloat(card.querySelector('.input-due').value) || 0;
  const notesEl = card.querySelector('.input-notes');
  const notes = notesEl ? notesEl.value : '';

  const payload = {
    month,
    flat_id: flatId,
    current_reading: curr,
    previous_reading: prev,
    house_rent: rent,
    due_amount: due,
    notes
  };

  API.queueAutoSaveFlat(payload, (res) => {
    try {
      localStorage.setItem(`rent_${month}`, JSON.stringify(currentMonthData.flats));
    } catch (e) {}
  });
}

// Record a Payment Transaction (Paid Bill)
async function recordFlatPayment(flatId) {
  const month = document.getElementById('monthSelector').value;
  const amtInput = document.getElementById(`pay-amt-${flatId}`);
  const methodInput = document.getElementById(`pay-method-${flatId}`);

  const amount = parseFloat(amtInput.value);
  if (!amount || amount <= 0) {
    alert('Please enter a valid amount.');
    amtInput.focus();
    return;
  }

  const payload = {
    month,
    flat_id: flatId,
    amount,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: methodInput ? methodInput.value : 'Cash',
    notes: ''
  };

  try {
    API.setSaveStatus('saving');
    const res = await API.recordPayment(payload);
    API.setSaveStatus('saved');

    amtInput.value = '';

    const flatObj = currentMonthData.flats.find(f => f.flat_id === flatId);
    if (flatObj) {
      flatObj.amount_paid = res.record.amount_paid;
      flatObj.payment_status = res.record.payment_status;
      flatObj.remaining_due = res.record.remaining_due;
      flatObj.payments = res.payments;
    }

    renderFlatCards(currentMonthData.flats, currentMonthData.settings);
    recalcOverallSummary();
  } catch (err) {
    API.setSaveStatus('error');
    alert('Payment recording failed: ' + err.message);
  }
}

// Delete an incorrect Payment Transaction
async function deleteFlatPayment(paymentId, flatId) {
  const confirmDelete = confirm('Delete this payment record?');
  if (!confirmDelete) return;

  try {
    API.setSaveStatus('saving');
    const res = await API.deletePayment(paymentId);
    API.setSaveStatus('saved');

    const flatObj = currentMonthData.flats.find(f => f.flat_id === flatId);
    if (flatObj && res.record) {
      flatObj.amount_paid = res.record.amount_paid;
      flatObj.payment_status = res.record.payment_status;
      flatObj.remaining_due = res.record.remaining_due;
      flatObj.payments = res.payments;
    }

    renderFlatCards(currentMonthData.flats, currentMonthData.settings);
    recalcOverallSummary();
  } catch (err) {
    API.setSaveStatus('error');
    alert('Failed to delete payment: ' + err.message);
  }
}

// Calculate All button handler
function calculateAll() {
  const cards = document.querySelectorAll('.flat-card');
  cards.forEach(card => {
    const flatId = Number(card.dataset.flatId);
    recalcFlatCard(card, flatId);
    triggerAutoSave(card, flatId);
  });
}

// Save All button handler
async function saveAllData() {
  const month = document.getElementById('monthSelector').value;
  try {
    await API.saveEntireMonth(month, currentMonthData.flats);
    alert('All monthly records saved successfully!');
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

// Fallback if backend server is not running
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
      remaining_due: Math.max(0, (found.total || 0) - (found.amount_paid || 0)),
      payment_status: found.payment_status || 'UNPAID',
      notes: found.notes || '',
      payments: []
    });
  }
  currentMonthData = {
    month,
    prevMonth: '',
    settings: { unitRate: 10, meterCharge: 60, currencySymbol: '৳' },
    flats: dummyFlats,
    summary: {}
  };
  renderFlatCards(dummyFlats, currentMonthData.settings);
  recalcOverallSummary();
}

window.switchWorkflowMode = switchWorkflowMode;
window.recordFlatPayment = recordFlatPayment;
window.deleteFlatPayment = deleteFlatPayment;
