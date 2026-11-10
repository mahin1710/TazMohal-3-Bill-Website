// script.js — TazMohal-3 Rent & Electricity Bill Calculator
// Preserves original calculations and UI while connecting to persistent SQLite backend

let autoSaveTimer = null;

// Calculate single flat bill
function calculateFlatBill(flat) {
  const current = parseFloat(flat.querySelector('.current-reading').value) || 0;
  const previous = parseFloat(flat.querySelector('.previous-reading').value) || 0;
  const rent = parseFloat(flat.querySelector('.house-rent').value) || 0;
  const due = parseFloat(flat.querySelector('.due-amount').value) || 0;
  const notesEl = flat.querySelector('.notes-text');
  const notes = notesEl ? notesEl.value : '';

  const electricUsed = Math.max(0, current - previous);
  const electricBill = electricUsed * 10 + 60; // 10 per unit + 60 base
  const total = electricBill + rent + due;

  flat.querySelector('.total-bill').textContent = total.toFixed(2);

  flat.querySelector('.bill-details').innerHTML = `
    <p>Electricity Used: <strong>${electricUsed.toFixed(2)}</strong> units</p>
    <p>Electric Bill: <strong>${electricBill.toFixed(2)}</strong> /=</p>
    <p>House Rent: <strong>${rent.toFixed(2)}</strong> /=</p>
    <p>Due Amount: <strong>${due.toFixed(2)}</strong> /=</p>
    ${notes ? `<p>Notes: <em>${escapeHtml(notes)}</em></p>` : ''}
    <p style="margin-top:6px;">Total: <strong>${total.toFixed(2)}</strong> /=</p>
  `;

  return {
    flat: flat.dataset.flatId,
    flat_id: Number(flat.dataset.flatId),
    previous: previous,
    previous_reading: previous,
    current: current,
    current_reading: current,
    units: electricUsed,
    units_used: electricUsed,
    electricBill: electricBill,
    electricity_bill: electricBill,
    rent: rent,
    house_rent: rent,
    due: due,
    due_amount: due,
    total: total,
    total_payable: total,
    notes: notes
  };
}

// Calculate all flats
function calculateAll() {
  const flats = document.querySelectorAll('.flat-row');
  return Array.from(flats).map(flat => calculateFlatBill(flat));
}

// Helper: Escape HTML in notes to avoid injection
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Show discreet save status
function setSaveStatus(text, color = '#b2dfdb') {
  const statusEl = document.getElementById('saveStatus');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = color;
}

// Debounced live auto-save on input change
function triggerAutoSave(flat) {
  const flatData = calculateFlatBill(flat);
  const month = document.getElementById('monthSelector').value;
  if (!month) return;

  setSaveStatus('💾 Saving...', '#fff59d');

  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    try {
      // 1. Save to backend database API
      const response = await fetch('/api/billing/save-flat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          flat_id: flatData.flat_id,
          current_reading: flatData.current,
          previous_reading: flatData.previous,
          house_rent: flatData.rent,
          due_amount: flatData.due,
          notes: flatData.notes
        })
      });

      // 2. Also save to localStorage for offline cache
      const allFlats = Array.from(document.querySelectorAll('.flat-row')).map(f => calculateFlatBill(f));
      localStorage.setItem('rent_' + month, JSON.stringify(allFlats));

      if (response.ok) {
        setSaveStatus('✓ Saved', '#a5d6a7');
        setTimeout(() => setSaveStatus(''), 2500);
      } else {
        setSaveStatus('✓ Saved locally', '#ffcc80');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (err) {
      console.warn('Auto-save network error, saved to localStorage:', err);
      const allFlats = Array.from(document.querySelectorAll('.flat-row')).map(f => calculateFlatBill(f));
      localStorage.setItem('rent_' + month, JSON.stringify(allFlats));
      setSaveStatus('✓ Saved locally', '#ffcc80');
      setTimeout(() => setSaveStatus(''), 2500);
    }
  }, 600);
}

// Load month data from backend or localStorage
async function loadMonthData(month) {
  if (!month) return;
  setSaveStatus('Loading...', '#b2dfdb');

  const flats = document.querySelectorAll('.flat-row');
  let backendLoaded = false;

  try {
    const res = await fetch(`/api/billing/month/${month}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.flats) && data.flats.length > 0) {
        const flatMap = new Map();
        data.flats.forEach(f => flatMap.set(Number(f.flat_number || f.flat_id), f));

        flats.forEach(flat => {
          const fid = Number(flat.dataset.flatId);
          const fData = flatMap.get(fid);
          if (fData) {
            flat.querySelector('.current-reading').value = fData.current_reading ?? 0;
            flat.querySelector('.previous-reading').value = fData.previous_reading ?? 0;
            flat.querySelector('.house-rent').value = fData.house_rent ?? 0;
            flat.querySelector('.due-amount').value = fData.due_amount ?? 0;
            const notesEl = flat.querySelector('.notes-text');
            if (notesEl) notesEl.value = fData.notes || '';
          }
          calculateFlatBill(flat);
        });

        // Mirror to localStorage
        const allFlats = Array.from(flats).map(f => calculateFlatBill(f));
        localStorage.setItem('rent_' + month, JSON.stringify(allFlats));

        backendLoaded = true;
        setSaveStatus('✓ Loaded', '#a5d6a7');
        setTimeout(() => setSaveStatus(''), 2000);
      }
    }
  } catch (err) {
    console.warn('Backend load failed, falling back to localStorage:', err);
  }

  // Fallback to localStorage if backend was unreachable
  if (!backendLoaded) {
    const cached = JSON.parse(localStorage.getItem('rent_' + month)) || [];
    if (cached.length > 0) {
      const cacheMap = new Map();
      cached.forEach(c => cacheMap.set(Number(c.flat || c.flat_id), c));

      flats.forEach(flat => {
        const fid = Number(flat.dataset.flatId);
        const fData = cacheMap.get(fid);
        if (fData) {
          flat.querySelector('.current-reading').value = fData.current ?? fData.current_reading ?? 0;
          flat.querySelector('.previous-reading').value = fData.previous ?? fData.previous_reading ?? 0;
          flat.querySelector('.house-rent').value = fData.rent ?? fData.house_rent ?? 0;
          flat.querySelector('.due-amount').value = fData.due ?? fData.due_amount ?? 0;
          const notesEl = flat.querySelector('.notes-text');
          if (notesEl) notesEl.value = fData.notes || '';
        }
        calculateFlatBill(flat);
      });
      setSaveStatus('Loaded from cache', '#ffcc80');
      setTimeout(() => setSaveStatus(''), 2000);
    } else {
      calculateAll();
      setSaveStatus('');
    }
  }
}

// On Month Selector change
function onMonthChange() {
  const month = document.getElementById('monthSelector').value;
  if (!month) return;
  localStorage.setItem('selected_month', month);
  loadMonthData(month);
}

// Save month data (manual button)
async function saveMonthData() {
  const month = document.getElementById('monthSelector').value;
  if (!month) {
    alert('Select a month!');
    return;
  }

  const flatsData = calculateAll();

  // Save to localStorage
  localStorage.setItem('rent_' + month, JSON.stringify(flatsData));

  // Save to backend database
  try {
    const res = await fetch('/api/billing/save-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month,
        flats: flatsData
      })
    });
    if (res.ok) {
      alert('Monthly data saved successfully!');
    } else {
      alert('Saved locally. (Backend returned status ' + res.status + ')');
    }
  } catch (err) {
    alert('Monthly data saved locally!');
  }
}

// Save & go to summary
async function saveAndGoToSummary() {
  const month = document.getElementById('monthSelector').value;
  if (month) {
    const flatsData = calculateAll();
    localStorage.setItem('rent_' + month, JSON.stringify(flatsData));
    try {
      await fetch('/api/billing/save-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, flats: flatsData })
      });
    } catch (e) {
      // ignore
    }
  }
  window.location.href = 'summary.html';
}

// Download Monthly Excel
async function downloadMonthlyExcel() {
  const month = document.getElementById('monthSelector').value;
  if (!month) { alert('Select a month!'); return; }

  let data = [];
  try {
    const res = await fetch(`/api/billing/month/${month}`);
    if (res.ok) {
      const json = await res.json();
      if (json.flats && json.flats.length) {
        data = json.flats.map(f => ({
          'Flat': f.flat_number ? `Flat ${f.flat_number}` : `Flat ${f.flat_id}`,
          'Previous Reading': f.previous_reading,
          'Current Reading': f.current_reading,
          'Units Used': f.units_used,
          'Electricity Bill': f.electricity_bill,
          'House Rent': f.house_rent,
          'Due Amount': f.due_amount,
          'Total Payable': f.total_payable,
          'Amount Paid': f.amount_paid,
          'Remaining Due': f.remaining_due,
          'Status': f.payment_status,
          'Notes': f.notes || ''
        }));
      }
    }
  } catch (e) {}

  if (!data.length) {
    const local = JSON.parse(localStorage.getItem('rent_' + month)) || [];
    if (local.length) {
      data = local.map(f => ({
        'Flat': `Flat ${f.flat}`,
        'Previous Reading': f.previous,
        'Current Reading': f.current,
        'Units Used': f.units,
        'Electricity Bill': f.electricBill,
        'House Rent': f.rent,
        'Due Amount': f.due,
        'Total Payable': f.total,
        'Notes': f.notes || ''
      }));
    }
  }

  if (!data.length) { alert('No data for this month'); return; }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');
  XLSX.writeFile(wb, `TazMohal3_${month}.xlsx`);
}

// Download Yearly Excel
async function downloadYearlyExcel() {
  const month = document.getElementById('monthSelector').value;
  const year = month ? month.split('-')[0] : new Date().getFullYear().toString();

  let allData = [];
  try {
    const res = await fetch(`/api/billing/yearly/${year}`);
    if (res.ok) {
      const json = await res.json();
      if (json.records && json.records.length) {
        allData = json.records.map(r => ({
          'Month': r.month,
          'Flat': `Flat ${r.flat_number}`,
          'Units': r.units_used,
          'Electricity Bill': r.electricity_bill,
          'House Rent': r.house_rent,
          'Due Amount': r.due_amount,
          'Total Payable': r.total_payable,
          'Amount Paid': r.amount_paid,
          'Remaining Due': r.remaining_due,
          'Status': r.payment_status
        }));
      }
    }
  } catch (e) {}

  if (!allData.length) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('rent_')) {
        const m = key.replace('rent_', '');
        const monthData = JSON.parse(localStorage.getItem(key)) || [];
        monthData.forEach(d => {
          allData.push({ Month: m, ...d });
        });
      }
    }
  }

  if (!allData.length) { alert('No yearly data'); return; }
  const ws = XLSX.utils.json_to_sheet(allData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Yearly Report');
  XLSX.writeFile(wb, `TazMohal3_Yearly_Report_${year}.xlsx`);
}

// Theme toggle
const toggleBtn = document.getElementById('themeToggle');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
  });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
  }

  // Set default month
  const monthInput = document.getElementById('monthSelector');
  if (monthInput) {
    const savedMonth = localStorage.getItem('selected_month');
    if (savedMonth) {
      monthInput.value = savedMonth;
    } else if (!monthInput.value) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      monthInput.value = `${yyyy}-${mm}`;
    }
  }

  // Attach live auto-save input listeners to all flat rows
  const flats = document.querySelectorAll('.flat-row');
  flats.forEach(flat => {
    const inputs = flat.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      input.addEventListener('input', () => triggerAutoSave(flat));
      input.addEventListener('change', () => triggerAutoSave(flat));
    });
  });

  // Load active month data
  if (monthInput && monthInput.value) {
    loadMonthData(monthInput.value);
  } else {
    calculateAll();
  }
});
