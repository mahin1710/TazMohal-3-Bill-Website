// public/js/app.js
// Main Billing Dashboard Controller with Pay Bill & Paid Bill Workflow

let currentMonthData = {
  month: '',
  prevMonth: '',
  settings: {},
  flats: [],
  summary: {}
};

let currentWorkflowMode = 'pay'; // 'pay' (Option 1) or 'paid' (Option 2)

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

// Workflow Mode Switcher (Option 1: Pay Bill vs Option 2: Paid Bill)
function switchWorkflowMode(mode) {
  currentWorkflowMode = mode;
  const tabPay = document.getElementById('tabPayBill');
  const tabPaid = document.getElementById('tabPaidBill');
  if (tabPay) tabPay.classList.toggle('active', mode === 'pay');
  if (tabPaid) tabPaid.classList.toggle('active', mode === 'paid');

  const guidance = document.getElementById('modeGuidanceText');
  if (guidance) {
    if (mode === 'pay') {
      guidance.innerHTML = '⚡ <strong>Option 1 (Pay Bill):</strong> Enter readings & rent. Previous readings and remaining dues are automatically carried forward.';
    } else {
      guidance.innerHTML = '💰 <strong>Option 2 (Paid Bill):</strong> Record tenant payments, track multiple installments, and review remaining balances.';
    }
  }

  // Update mode across all cards
  document.querySelectorAll('.flat-card').forEach(card => {
    const flatId = Number(card.dataset.flatId);
    setCardMode(card, flatId, mode);
  });
}

function setCardMode(card, flatId, mode) {
  const payView = card.querySelector(`#pay-view-${flatId}`);
  const paidView = card.querySelector(`#paid-view-${flatId}`);
  const btnPay = card.querySelector(`#mode-btn-pay-${flatId}`);
  const btnPaid = card.querySelector(`#mode-btn-paid-${flatId}`);

  if (payView && paidView) {
    if (mode === 'pay') {
      payView.style.display = 'block';
      paidView.style.display = 'none';
      if (btnPay) btnPay.classList.add('active');
      if (btnPaid) btnPaid.classList.remove('active');
    } else {
      payView.style.display = 'none';
      paidView.style.display = 'block';
      if (btnPay) btnPay.classList.remove('active');
      if (btnPaid) btnPaid.classList.add('active');
    }
  }
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
  const todayStr = new Date().toISOString().split('T')[0];

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

    // Build payment history rows
    const payments = flat.payments || [];
    let paymentsHtml = '';
    if (payments.length === 0) {
      paymentsHtml = '<div style="padding: 10px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No payments recorded yet for this month.</div>';
    } else {
      payments.forEach(p => {
        paymentsHtml += `
          <div class="payment-history-item">
            <div class="payment-meta">
              <strong>${sym} ${Number(p.amount).toFixed(2)}</strong>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${p.payment_date} • <span class="payment-method-pill">${p.payment_method}</span></span>
              ${p.notes ? `<span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">"${p.notes}"</span>` : ''}
            </div>
            <button class="btn btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" title="Delete this payment record" onclick="deleteFlatPayment(${p.id}, ${flat.flat_id})">
              🗑️
            </button>
          </div>
        `;
      });
    }

    card.innerHTML = `
      <!-- Card Header -->
      <div class="flat-card-header">
        <div class="flat-card-title">
          <h3>${flat.flat_name || `Flat ${flat.flat_number}`}</h3>
          ${flat.tenant_name ? `<span class="tenant-badge">👤 ${flat.tenant_name}</span>` : ''}
        </div>
        <span class="status-badge ${statusClass}" id="status-badge-${flat.flat_id}">${status}</span>
      </div>

      <!-- Card Mode Toggle Pill -->
      <div class="card-mode-toggle">
        <button class="card-mode-btn ${currentWorkflowMode === 'pay' ? 'active' : ''}" id="mode-btn-pay-${flat.flat_id}" onclick="setCardMode(document.getElementById('flat-card-${flat.flat_id}'), ${flat.flat_id}, 'pay')">
          ⚡ Option 1: Pay Bill (Calculate)
        </button>
        <button class="card-mode-btn ${currentWorkflowMode === 'paid' ? 'active' : ''}" id="mode-btn-paid-${flat.flat_id}" onclick="setCardMode(document.getElementById('flat-card-${flat.flat_id}'), ${flat.flat_id}, 'paid')">
          💰 Option 2: Paid Bill (Payments)
        </button>
      </div>

      <!-- VIEW 1: PAY BILL (Generate & Calculate) -->
      <div class="pay-bill-view" id="pay-view-${flat.flat_id}" style="display: ${currentWorkflowMode === 'pay' ? 'block' : 'none'};">
        <div class="input-group-grid">
          <div class="input-field">
            <label>Current Meter Reading</label>
            <input type="number" step="0.01" class="input-curr" value="${flat.current_reading || ''}" placeholder="0.00" />
          </div>
          <div class="input-field">
            <label>
              Previous Meter Reading
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
              Previous Outstanding Due (${sym})
              ${flat.prev_month_due > 0 ? `<span class="badge-carried" title="Unpaid balance carried from previous month">🔄 Due: ${sym}${flat.prev_month_due}</span>` : ''}
            </label>
            <input type="number" step="1" class="input-due" value="${flat.due_amount || ''}" placeholder="0" />
          </div>
          
          <div class="input-field full-width">
            <label>Notes / Memo</label>
            <textarea class="input-notes" rows="2" placeholder="Write optional notes or memo...">${flat.notes || ''}</textarea>
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
            <span>Total Monthly Bill:</span>
            <span class="total-amount" id="total-val-${flat.flat_id}">${sym} ${total.toFixed(2)}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
          <button class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 12px;" onclick="saveSingleFlatBill(${flat.flat_id})">
            💾 Save Bill
          </button>
          <button class="btn btn-outline" style="font-size: 0.8rem; padding: 6px 12px;" onclick="setCardMode(document.getElementById('flat-card-${flat.flat_id}'), ${flat.flat_id}, 'paid')">
            💰 Record Payment ➔
          </button>
        </div>
      </div>

      <!-- VIEW 2: PAID BILL (Record Payments & Ledger) -->
      <div class="paid-bill-view" id="paid-view-${flat.flat_id}" style="display: ${currentWorkflowMode === 'paid' ? 'block' : 'none'};">
        <!-- Balance Overview Card -->
        <div class="balance-card-grid">
          <div class="balance-item">
            <span class="lbl">Total Monthly Bill</span>
            <span class="val blue" id="paid-tot-${flat.flat_id}">${sym} ${total.toFixed(2)}</span>
          </div>
          <div class="balance-item">
            <span class="lbl">Total Paid So Far</span>
            <span class="val green" id="paid-sum-${flat.flat_id}">${sym} ${paid.toFixed(2)}</span>
          </div>
          <div class="balance-item" style="grid-column: 1 / -1; border-top: 1px solid var(--border); padding-top: 6px; margin-top: 2px;">
            <span class="lbl">Remaining Due Amount</span>
            <span class="val ${remainingDue > 0 ? 'red' : 'green'}" id="paid-rem-${flat.flat_id}">${sym} ${remainingDue.toFixed(2)}</span>
          </div>
        </div>

        <!-- Add Payment Form -->
        <div class="record-payment-form">
          <div style="font-size: 0.82rem; font-weight: 700; color: var(--primary); margin-bottom: 8px;">
            ➕ Receive Payment from ${flat.tenant_name || `Flat ${flat.flat_number}`}
          </div>
          <div class="input-group-grid" style="margin-bottom: 8px;">
            <div class="input-field">
              <label>Amount Received (${sym})</label>
              <input type="number" step="1" id="pay-amt-${flat.flat_id}" placeholder="e.g. 5000" />
            </div>
            <div class="input-field">
              <label>Payment Date</label>
              <input type="date" id="pay-date-${flat.flat_id}" value="${todayStr}" />
            </div>
            <div class="input-field">
              <label>Payment Method</label>
              <select id="pay-method-${flat.flat_id}">
                <option value="Cash">Cash</option>
                <option value="bKash">bKash</option>
                <option value="Nagad">Nagad</option>
                <option value="Rocket">Rocket</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="input-field">
              <label>Payment Note / Ref</label>
              <input type="text" id="pay-note-${flat.flat_id}" placeholder="e.g. 1st installment" />
            </div>
          </div>
          <button class="btn btn-success" style="width: 100%; justify-content: center; padding: 6px 12px; font-size: 0.82rem;" onclick="recordFlatPayment(${flat.flat_id})">
            ✅ Save Payment Transaction
          </button>
        </div>

        <!-- Payment History Ledger -->
        <div class="payment-history-wrap">
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
            📜 Payment Ledger (${payments.length} Transaction${payments.length === 1 ? '' : 's'})
          </div>
          <div class="payment-history-list" id="payment-list-${flat.flat_id}">
            ${paymentsHtml}
          </div>
        </div>

        <!-- Footer Actions in Paid View -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <button class="btn btn-outline" style="font-size: 0.78rem; padding: 4px 8px;" onclick="setCardMode(document.getElementById('flat-card-${flat.flat_id}'), ${flat.flat_id}, 'pay')">
            ⬅ Edit Bill
          </button>
          <button class="btn btn-outline" style="font-size: 0.78rem; padding: 4px 8px;" onclick="printFlatReceipt(${flat.flat_id})">
            🖨️ Receipt
          </button>
        </div>
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
  card.querySelector(`#units-val-${flatId}`).textContent = `${units.toFixed(2)} units`;
  card.querySelector(`#elec-val-${flatId}`).textContent = `${sym} ${elecBill.toFixed(2)}`;
  card.querySelector(`#total-val-${flatId}`).textContent = `${sym} ${total.toFixed(2)}`;

  // Update Paid Bill view elements
  const paidTot = card.querySelector(`#paid-tot-${flatId}`);
  const paidRem = card.querySelector(`#paid-rem-${flatId}`);
  if (paidTot) paidTot.textContent = `${sym} ${total.toFixed(2)}`;
  if (paidRem) {
    paidRem.textContent = `${sym} ${remainingDue.toFixed(2)}`;
    paidRem.className = `val ${remainingDue > 0 ? 'red' : 'green'}`;
  }

  const badge = card.querySelector(`#status-badge-${flatId}`);
  if (badge) {
    const statusClass = status.toLowerCase().replace(/\s+/g, '-');
    badge.className = `status-badge ${statusClass}`;
    badge.textContent = status;
  }

  // Update in-memory flat object
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

// Trigger debounced auto-save for Pay Bill inputs
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

// Save single flat bill explicitly
async function saveSingleFlatBill(flatId) {
  const card = document.getElementById(`flat-card-${flatId}`);
  if (!card) return;
  const month = document.getElementById('monthSelector').value;
  const curr = parseFloat(card.querySelector('.input-curr').value) || 0;
  const prev = parseFloat(card.querySelector('.input-prev').value) || 0;
  const rent = parseFloat(card.querySelector('.input-rent').value) || 0;
  const due = parseFloat(card.querySelector('.input-due').value) || 0;
  const notesEl = card.querySelector('.input-notes');
  const notes = notesEl ? notesEl.value : '';

  API.setSaveStatus('saving');
  try {
    const res = await API.request('/api/billing/save-flat', {
      method: 'POST',
      body: JSON.stringify({
        month,
        flat_id: flatId,
        current_reading: curr,
        previous_reading: prev,
        house_rent: rent,
        due_amount: due,
        notes
      })
    });
    API.setSaveStatus('saved');
    alert(`Flat ${flatId} monthly bill saved successfully!`);
  } catch (err) {
    API.setSaveStatus('error');
    alert('Failed to save bill: ' + err.message);
  }
}

// Record a Payment Transaction (Option 2: Paid Bill)
async function recordFlatPayment(flatId) {
  const month = document.getElementById('monthSelector').value;
  const amtInput = document.getElementById(`pay-amt-${flatId}`);
  const dateInput = document.getElementById(`pay-date-${flatId}`);
  const methodInput = document.getElementById(`pay-method-${flatId}`);
  const noteInput = document.getElementById(`pay-note-${flatId}`);

  const amount = parseFloat(amtInput.value);
  if (!amount || amount <= 0) {
    alert('Please enter a valid payment amount greater than 0.');
    amtInput.focus();
    return;
  }

  const payload = {
    month,
    flat_id: flatId,
    amount,
    payment_date: dateInput.value,
    payment_method: methodInput.value,
    notes: noteInput.value
  };

  try {
    API.setSaveStatus('saving');
    const res = await API.recordPayment(payload);
    API.setSaveStatus('saved');

    // Reset amount and note input
    amtInput.value = '';
    noteInput.value = '';

    // Update in-memory flat object
    const flatObj = currentMonthData.flats.find(f => f.flat_id === flatId);
    if (flatObj) {
      flatObj.amount_paid = res.record.amount_paid;
      flatObj.payment_status = res.record.payment_status;
      flatObj.remaining_due = res.record.remaining_due;
      flatObj.payments = res.payments;
    }

    // Re-render flat cards to update balance and ledger
    renderFlatCards(currentMonthData.flats, currentMonthData.settings);
    recalcOverallSummary();

    alert(`✅ Payment of ৳${amount.toFixed(2)} recorded for Flat ${flatId}! Status: ${res.record.payment_status}`);
  } catch (err) {
    API.setSaveStatus('error');
    alert('Payment recording failed: ' + err.message);
  }
}

// Delete an incorrect Payment Transaction
async function deleteFlatPayment(paymentId, flatId) {
  const confirmDelete = confirm('Are you sure you want to delete this payment record? This will recalculate the remaining due.');
  if (!confirmDelete) return;

  try {
    API.setSaveStatus('saving');
    const res = await API.deletePayment(paymentId);
    API.setSaveStatus('saved');

    // Update in-memory flat object
    const flatObj = currentMonthData.flats.find(f => f.flat_id === flatId);
    if (flatObj && res.record) {
      flatObj.amount_paid = res.record.amount_paid;
      flatObj.payment_status = res.record.payment_status;
      flatObj.remaining_due = res.record.remaining_due;
      flatObj.payments = res.payments;
    }

    renderFlatCards(currentMonthData.flats, currentMonthData.settings);
    recalcOverallSummary();
    alert('Payment record deleted successfully.');
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
  alert('All flat calculations refreshed and saved!');
}

// Save All button handler
async function saveAllData() {
  const month = document.getElementById('monthSelector').value;
  try {
    await API.saveEntireMonth(month, currentMonthData.flats);
    alert('All monthly bills saved successfully into database!');
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
window.setCardMode = setCardMode;
window.recordFlatPayment = recordFlatPayment;
window.deleteFlatPayment = deleteFlatPayment;
window.saveSingleFlatBill = saveSingleFlatBill;
