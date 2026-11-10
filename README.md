# 🏢 TazMohal-3 — Flat Rent & Electricity Bill Calculator

[![GitHub repo](https://img.shields.io/badge/GitHub-mahin1710%2FTazMohal--3--Bill--Website-blue?logo=github)](https://github.com/mahin1710/TazMohal-3-Bill-Website)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20Browser-orange.svg)](#)
[![Built with](https://img.shields.io/badge/Built%20with-HTML5%20%7C%20CSS3%20%7C%20JavaScript-yellow.svg)](#)

> **TazMohal-3** (Uttarkhan, Uttara, Dhaka-1230) — A lightweight, modern, and client-side web application designed to automate monthly house rent and electricity bill calculations for a multi-unit residential property.

---

## 📌 Overview

**TazMohal-3 Bill Website** eliminates manual ledger calculation errors by offering an intuitive interface to input meter readings, rent, and previous dues for all flats (Flat 1 through Flat 9). It instantly calculates totals, stores monthly records locally, and exports professional reports directly to Excel spreadsheets.

---

## ✨ Key Features

- **🏠 Multi-Unit Grid (Flats 1 to 9)**: Individual calculation cards for each residential unit.
- **⚡ Automated Electricity Calculation**:
  - Calculates units consumed from Current and Previous meter readings.
  - Applies unit tariff with base meter charges automatically.
- **💰 Complete Total Breakdown**: Combines Electricity Bill + House Rent + Previous Due.
- **📊 Instant Excel Reports (Powered by SheetJS)**:
  - **Monthly Report**: Export full monthly summary with all flat breakdown.
  - **Yearly Report**: Aggregate and export all saved months into a single master sheet.
  - **Detailed Sheet**: Dedicated breakdown table in `details.html` with individual unit charges and totals.
- **💾 Local Persistence (`localStorage`)**: Saves and retrieves monthly billing data directly in your browser without requiring a backend database.
- **🌓 Dark / Light Mode**: Seamless theme switching with persistent user preference.
- **🔄 Auto Git Sync Utility**: Includes an automated PowerShell background sync script (`auto-sync.ps1`) to push changes to GitHub at scheduled intervals.

---

## 🧮 Billing Logic & Formula

| Component | Formula / Calculation |
| :--- | :--- |
| **Units Consumed** | `Current Reading - Previous Reading` |
| **Electricity Bill** | `(Units Consumed × 10) + 60` *(৳10 per unit + ৳60 base meter charge)* |
| **Total Payable Bill** | `Electricity Bill + House Rent + Due Amount` |

---

## 📂 Project Structure

```plaintext
TazMohal-3-Bill-Website/
│
├── index.html         # Main dashboard & rent calculator (Flats 1-9)
├── details.html       # Detailed electricity bill breakdown & table view
├── styles.css         # Responsive styling, CSS variables & theme tokens
├── script.js          # Calculation logic, storage handler & SheetJS integration
├── auto-sync.ps1      # PowerShell auto-commit & push script (every 10 minutes)
└── README.md          # Comprehensive documentation
```

---

## 🚀 Getting Started

### 1. Run Locally
No server setup or dependencies are required. Simply open `index.html` in any modern web browser:

- Double-click `index.html`, or
- Use VS Code Live Server extension, or
- Run a simple local HTTP server:
  ```bash
  # Python 3
  python -m http.server 8000
  ```
  Then visit `http://localhost:8000`.

### 2. How to Use
1. **Select Month**: Pick the target billing month using the month picker in the header.
2. **Enter Readings**:
   - Current electric meter reading.
   - Previous electric meter reading.
   - Fixed monthly house rent.
   - Any prior outstanding due amount.
3. **Calculate**: Click **"Calculate All"** to see instant itemized summaries for each flat.
4. **Save**: Click **"Save Monthly Data"** to store the month's records into local storage.
5. **Export**: Click **"Download Month Excel"** or **"Download Yearly Excel"** to save your `.xlsx` spreadsheets.

---

## 🔄 Automated Git Sync (`auto-sync.ps1`)

A custom automation script is included for automated repository synchronization:

- Checks the repository every **10 minutes**.
- If changes are detected, automatically stages, commits with timestamp, and pushes to `origin/main`.
- **To run manually in PowerShell**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\auto-sync.ps1
  ```

---

## 🛠️ Built With

- **HTML5** & **CSS3** (CSS Grid, Flexbox, CSS Variables)
- **Vanilla JavaScript (ES6+)**
- **[SheetJS / xlsx](https://cdn.sheetjs.com/)** (Client-side spreadsheet generation)
- **HTML5 Web Storage API** (`localStorage`)

---

## 📍 Property Details & Author

- **Property**: TazMohal-3
- **Location**: Uttarkhan, Uttara, Dhaka-1230, Bangladesh
- **Developer / Maintainer**: [Md. Mahedi Hasan Mahin](https://github.com/mahin1710)
