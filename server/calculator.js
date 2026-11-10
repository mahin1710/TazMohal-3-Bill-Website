// server/calculator.js
// Standardized billing calculation engine with strict validation and floating point precision control

function roundCurrency(val) {
  const num = Number(val) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function calculateBill({
  currentReading = 0,
  previousReading = 0,
  houseRent = 0,
  dueAmount = 0,
  unitRate = 10,
  meterCharge = 60,
  amountPaid = 0
}) {
  const current = Math.max(0, roundCurrency(currentReading));
  const previous = Math.max(0, roundCurrency(previousReading));
  const rent = Math.max(0, roundCurrency(houseRent));
  const due = Math.max(0, roundCurrency(dueAmount));
  const rate = Math.max(0, roundCurrency(unitRate));
  const baseCharge = Math.max(0, roundCurrency(meterCharge));
  const paid = Math.max(0, roundCurrency(amountPaid));

  let validationWarning = null;
  let units = 0;

  if (current < previous) {
    validationWarning = 'Current reading cannot be lower than previous reading';
    units = 0;
  } else {
    units = roundCurrency(current - previous);
  }

  // Electricity bill = (units * unitRate) + meterCharge (if units > 0 or base charge applies)
  const electricityBill = roundCurrency((units * rate) + baseCharge);
  const totalPayable = roundCurrency(electricityBill + rent + due);

  let paymentStatus = 'Unpaid';
  if (paid >= totalPayable && totalPayable > 0) {
    paymentStatus = 'Paid';
  } else if (paid > 0 && paid < totalPayable) {
    paymentStatus = 'Partial';
  } else if (totalPayable === 0 && paid === 0) {
    paymentStatus = 'Paid';
  }

  return {
    previousReading: previous,
    currentReading: current,
    unitsUsed: units,
    unitRate: rate,
    meterCharge: baseCharge,
    electricityBill,
    houseRent: rent,
    dueAmount: due,
    totalPayable,
    amountPaid: paid,
    paymentStatus,
    validationWarning
  };
}

module.exports = {
  roundCurrency,
  calculateBill
};
