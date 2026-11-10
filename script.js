// Calculate flat bill
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
    ${notes ? `<p>Notes: <em>${notes}</em></p>` : ''}
    <p style="margin-top:6px;">Total: <strong>${total.toFixed(2)}</strong> /=</p>
  `;

  return {
    flat: flat.dataset.flatId,
    previous: previous,
    current: current,
    units: electricUsed,
    electricBill: electricBill,
    rent: rent,
    due: due,
    total: total,
    notes: notes
  };
}

// Calculate all flats
function calculateAll() {
  const flats = document.querySelectorAll('.flat-row');
  flats.forEach(flat => calculateFlatBill(flat));
}

// Save month data
function saveMonthData() {
  const month = document.getElementById("monthSelector").value;
  if(!month){ alert("Select a month!"); return; }

  const flats = document.querySelectorAll('.flat-row');
  const data = Array.from(flats).map(flat => calculateFlatBill(flat));

  localStorage.setItem("rent_" + month, JSON.stringify(data));
  alert("Monthly data saved successfully!");
}

// Save & go to summary
function saveAndGoToSummary() {
  calculateAll();
  window.location.href = 'summary.html';
}

// Download Monthly Excel
function downloadMonthlyExcel() {
  const month = document.getElementById("monthSelector").value;
  if(!month){ alert("Select a month!"); return; }

  const data = JSON.parse(localStorage.getItem("rent_" + month)) || [];
  if(!data.length){ alert("No data for this month"); return; }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
  XLSX.writeFile(wb, "TazMohal3_" + month + ".xlsx");
}

// Download Yearly Excel
function downloadYearlyExcel() {
  const allData = [];
  for(let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if(key.startsWith("rent_")){
      const monthData = JSON.parse(localStorage.getItem(key));
      allData.push(...monthData);
    }
  }
  if(!allData.length){ alert("No yearly data"); return; }
  const ws = XLSX.utils.json_to_sheet(allData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Yearly Report");
  XLSX.writeFile(wb, "TazMohal3_Yearly_Report.xlsx");
}

// Theme toggle
const toggleBtn = document.getElementById("themeToggle");
toggleBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", document.body.classList.contains("dark-mode")?"dark":"light");
});
window.addEventListener("load", () => {
  if(localStorage.getItem("theme") === "dark"){ document.body.classList.add("dark-mode"); }
});