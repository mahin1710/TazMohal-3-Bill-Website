// public/js/reports.js
// Excel (SheetJS) and Printable PDF Billing Statement Generator

const Reports = {
  // Download Monthly Report in Excel
  downloadMonthlyExcel(month, data, settings = {}) {
    if (!window.XLSX) {
      alert('SheetJS library is loading, please try again in a moment.');
      return;
    }

    const propName = settings.propertyName || 'TazMohal-3';
    const propAddr = settings.propertyAddress || 'Uttarkhan, Uttara, Dhaka-1230';
    const currency = settings.currencySymbol || '৳';

    const rows = [];
    rows.push([`${propName} - Monthly Rent & Utility Billing Statement`]);
    rows.push([`Property: ${propAddr}`]);
    rows.push([`Billing Month: ${month}`]);
    rows.push([]); // blank row

    // Table Header
    rows.push([
      'Flat',
      'Tenant Name',
      'Previous Reading',
      'Current Reading',
      'Units Used',
      'Unit Rate (' + currency + ')',
      'Base Charge (' + currency + ')',
      'Electricity Bill (' + currency + ')',
      'House Rent (' + currency + ')',
      'Prior Due (' + currency + ')',
      'Total Payable (' + currency + ')',
      'Amount Paid (' + currency + ')',
      'Outstanding (' + currency + ')',
      'Payment Status',
      'Notes'
    ]);

    let sumUnits = 0;
    let sumElec = 0;
    let sumRent = 0;
    let sumDue = 0;
    let sumTotal = 0;
    let sumPaid = 0;
    let sumOutstanding = 0;

    data.forEach(flat => {
      const units = Number(flat.units_used) || 0;
      const elec = Number(flat.electricity_bill) || 0;
      const rent = Number(flat.house_rent) || 0;
      const due = Number(flat.due_amount) || 0;
      const total = Number(flat.total_payable) || 0;
      const paid = Number(flat.amount_paid) || 0;
      const outstanding = total - paid;

      sumUnits += units;
      sumElec += elec;
      sumRent += rent;
      sumDue += due;
      sumTotal += total;
      sumPaid += paid;
      sumOutstanding += outstanding;

      rows.push([
        flat.flat_name || `Flat ${flat.flat_number}`,
        flat.tenant_name || 'N/A',
        flat.previous_reading,
        flat.current_reading,
        units,
        flat.unit_rate,
        flat.meter_charge,
        elec,
        rent,
        due,
        total,
        paid,
        outstanding,
        flat.payment_status || 'Unpaid',
        flat.notes || ''
      ]);
    });

    // Summary Totals Row
    rows.push([]);
    rows.push([
      'TOTALS',
      '',
      '',
      '',
      sumUnits,
      '',
      '',
      sumElec,
      sumRent,
      sumDue,
      sumTotal,
      sumPaid,
      sumOutstanding,
      '',
      ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    ws['!cols'] = [
      { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
      { wch: 14 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Billing_${month}`);
    XLSX.writeFile(wb, `TazMohal3_Billing_${month}.xlsx`);
  },

  // Download Yearly Report in Excel
  downloadYearlyExcel(year, records, settings = {}) {
    if (!window.XLSX) {
      alert('SheetJS library is loading.');
      return;
    }

    const propName = settings.propertyName || 'TazMohal-3';
    const rows = [];
    rows.push([`${propName} - Consolidated Yearly Billing Report (${year})`]);
    rows.push([]);

    rows.push([
      'Month',
      'Flat',
      'Tenant',
      'Units Consumed',
      'Electricity Bill',
      'House Rent',
      'Due Amount',
      'Total Payable',
      'Amount Paid',
      'Outstanding',
      'Status'
    ]);

    records.forEach(r => {
      const outstanding = (Number(r.total_payable) || 0) - (Number(r.amount_paid) || 0);
      rows.push([
        r.month,
        r.flat_name || `Flat ${r.flat_id}`,
        r.tenant_name || '',
        r.units_used,
        r.electricity_bill,
        r.house_rent,
        r.due_amount,
        r.total_payable,
        r.amount_paid,
        outstanding,
        r.payment_status
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 15 },
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Year_${year}`);
    XLSX.writeFile(wb, `TazMohal3_Yearly_${year}.xlsx`);
  },

  // Printable Single Flat Bill / PDF Statement
  printSingleInvoice(flat, month, settings = {}) {
    const propName = settings.propertyName || 'TazMohal-3';
    const propAddr = settings.propertyAddress || 'Uttarkhan, Uttara, Dhaka-1230';
    const currency = settings.currencySymbol || '৳';

    const printWin = window.open('', '_blank', 'width=800,height=900');
    if (!printWin) {
      alert('Please allow popups to print invoices.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${flat.flat_name} - ${month}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #1e293b; }
          .invoice-box { max-width: 650px; margin: auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 30px; }
          .header { text-align: center; border-bottom: 2px solid #004d66; padding-bottom: 16px; margin-bottom: 24px; }
          .header h1 { margin: 0; color: #004d66; font-size: 26px; }
          .header p { margin: 4px 0; color: #64748b; font-size: 14px; }
          .meta-table, .calc-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .meta-table td { padding: 6px 0; font-size: 14px; }
          .meta-table td strong { color: #004d66; }
          .calc-table th, .calc-table td { border: 1px solid #e2e8f0; padding: 10px 14px; font-size: 14px; }
          .calc-table th { background: #f8fafc; text-align: left; color: #004d66; }
          .calc-table td.num { text-align: right; }
          .total-row td { font-weight: bold; font-size: 16px; background: #f1f5f9; color: #004d66; }
          .status { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; }
          .status.paid { background: #d1fae5; color: #065f46; }
          .status.unpaid { background: #fee2e2; color: #991b1b; }
          .status.partial { background: #fef3c7; color: #92400e; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          @media print { body { padding: 0; } .invoice-box { border: none; } }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="header">
            <h1>${propName}</h1>
            <p>${propAddr}</p>
            <p><strong>Monthly Rent & Electricity Billing Receipt</strong></p>
          </div>

          <table class="meta-table">
            <tr>
              <td><strong>Flat:</strong> ${flat.flat_name || `Flat ${flat.flat_number}`}</td>
              <td style="text-align: right;"><strong>Billing Month:</strong> ${month}</td>
            </tr>
            <tr>
              <td><strong>Tenant:</strong> ${flat.tenant_name || 'N/A'}</td>
              <td style="text-align: right;"><strong>Date Issued:</strong> ${new Date().toLocaleDateString()}</td>
            </tr>
            <tr>
              <td><strong>Payment Status:</strong> <span class="status ${String(flat.payment_status).toLowerCase()}">${flat.payment_status}</span></td>
              <td style="text-align: right;"><strong>Contact:</strong> ${flat.phone || 'N/A'}</td>
            </tr>
          </table>

          <table class="calc-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="num">Details / Calculation</th>
                <th class="num">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Electricity Meter Reading</td>
                <td class="num">${flat.previous_reading} ➔ ${flat.current_reading}</td>
                <td class="num">${flat.units_used} Units</td>
              </tr>
              <tr>
                <td>Electricity Consumption</td>
                <td class="num">${flat.units_used} units × ${currency}${flat.unit_rate}</td>
                <td class="num">${(flat.units_used * flat.unit_rate).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Base Meter Charge</td>
                <td class="num">Standard Flat Meter Fee</td>
                <td class="num">${Number(flat.meter_charge).toFixed(2)}</td>
              </tr>
              <tr>
                <td><strong>Total Electricity Bill</strong></td>
                <td class="num"><em>(Units × Rate) + Base Charge</em></td>
                <td class="num"><strong>${Number(flat.electricity_bill).toFixed(2)}</strong></td>
              </tr>
              <tr>
                <td>Monthly House Rent</td>
                <td class="num">Standard Rent</td>
                <td class="num">${Number(flat.house_rent).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Previous Outstanding Due</td>
                <td class="num">Prior Unpaid Balance</td>
                <td class="num">${Number(flat.due_amount).toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2">TOTAL PAYABLE AMOUNT</td>
                <td class="num">${currency} ${Number(flat.total_payable).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Amount Paid</td>
                <td class="num">Received</td>
                <td class="num">${currency} ${Number(flat.amount_paid).toFixed(2)}</td>
              </tr>
              <tr style="font-weight: bold; color: ${flat.total_payable - flat.amount_paid > 0 ? '#b91c1c' : '#047857'}">
                <td colspan="2">Remaining Outstanding Due</td>
                <td class="num">${currency} ${(flat.total_payable - flat.amount_paid).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          ${flat.notes ? `<p style="font-size: 13px; color: #64748b;"><strong>Notes:</strong> ${flat.notes}</p>` : ''}

          <div class="footer">
            <p>Thank you for your prompt payment! | System Generated by TazMohal-3 Billing Portal</p>
          </div>
        </div>
        <script>window.onload = function() { window.print(); };<\/script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  }
};

window.Reports = Reports;

