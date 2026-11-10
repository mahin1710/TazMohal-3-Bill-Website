# 🏢 TazMohal-3 — Residential Billing & Property Management System (v2.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform: Node.js & Web](https://img.shields.io/badge/Node.js-v22%2B%20%7C%20v24-339933?logo=node.js)](https://nodejs.org/)
[![Database: SQLite (Built-in)](https://img.shields.io/badge/Database-SQLite%20(node%3Asqlite)-003B57?logo=sqlite)](https://sqlite.org/)
[![UI: Modern Responsive](https://img.shields.io/badge/UI-Responsive%20%7C%20Light%20%26%20Dark%20Mode-0284c7)](#)
[![Security: Bcrypt & JWT](https://img.shields.io/badge/Security-Bcrypt%20%26%20JWT%20Guarded-red)](#)
[![Tests: 10/10 Passing](https://img.shields.io/badge/Tests-10%2F10%20Passing-brightgreen)](#)

> **TazMohal-3** (Uttarkhan, Uttara, Dhaka-1230, Bangladesh)  
> A professional, secure, and modern residential property billing management system designed for multi-unit apartment buildings. Features real-time debounced live data saving into persistent SQLite storage, dynamic tariff configuration, payment tracking, Excel & printable PDF invoices, and automated disaster recovery backups.

---

## 📑 Table of Contents

1. [Overview & Modernization Highlights](#-overview--modernization-highlights)
2. [Technology Stack & Architecture](#-technology-stack--architecture)
3. [Core Features](#-core-features)
4. [Billing Logic & Mathematical Formula](#-billing-logic--mathematical-formula)
5. [Database Schema & Storage](#-database-schema--storage)
6. [Live Debounced Auto-Saving Engine](#-live-debounced-auto-saving-engine)
7. [Installation & Getting Started](#-installation--getting-started)
8. [Configuration & Environment Variables](#-configuration--environment-variables)
9. [Default Credentials & Authentication](#-default-credentials--authentication)
10. [Excel & PDF Statement Exports](#-excel--pdf-statement-exports)
11. [Backup & Disaster Recovery](#-backup--disaster-recovery)
12. [Security Perimeter & GitHub Safety](#-security-perimeter--github-safety)
13. [Automated Verification Tests](#-automated-verification-tests)
14. [File Inventory & Changelog](#-file-inventory--changelog)

---

## 📌 Overview & Modernization Highlights

In Version 2.0, TazMohal-3 has evolved from a static client-side calculator into a **production-ready, full-stack property management application**:

- **Persistent ACID Database**: Switched from ephemeral browser `localStorage` to a persistent SQLite database (`node:sqlite`) running on Node.js.
- **Zero-Loss Live Saving**: Every keystroke in meter readings, house rent, and dues is automatically debounced and persisted to SQLite in real-time.
- **Configurable Tariffs**: Unit rate (৳/unit) and meter charge (৳/flat) are fully configurable from the admin settings portal instead of hardcoded.
- **Tenant Management**: Track tenant names, phone numbers, and default rents across all 9 flats (Flat 1 through Flat 9).
- **Payment Lifecycle Tracking**: Monitor payments (`Unpaid`, `Partial`, `Paid`), record actual collected amounts, and track outstanding balances.
- **Resolved Broken Navigation**: Added a comprehensive `summary.html` analytics dashboard (previously returned 404).
- **Printable Invoices & Excel Exports**: 1-click printable PDF tenant receipts, monthly statements, and yearly master Excel sheets via SheetJS.
- **Automatic & Manual Snapshots**: Timestamped database backups with instant 1-click restore and JSON export/import.
- **Guarded GitHub Automation**: Updated `auto-sync.ps1` with security checks preventing accidental commits of database records or secrets.

---

## 🛠️ Technology Stack & Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TazMohal-3 Client Tier                          │
│                                                                        │
│   Dashboard (index.html)     Summary (summary.html)    Details         │
│   History (history.html)     Settings (settings.html)  Login           │
│                                                                        │
│   ├── Debounced Auto-Save Controller (public/js/api.js)                │
│   ├── Real-Time Calculation & UI Engine (public/js/app.js)             │
│   └── SheetJS Excel & Printable PDF Generator (public/js/reports.js)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST API (JSON)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        TazMohal-3 Backend Tier                         │
│                                                                        │
│   Express.js Web Server (server/index.js - Port 3000)                  │
│                                                                        │
│   ├── Authentication & Rate Limiting (server/auth.js - JWT & Bcrypt)   │
│   ├── Billing API & Auto-Save Handler (server/billing.js)              │
│   ├── Calculation & Precision Engine (server/calculator.js)            │
│   ├── Flat & Tenant Management (server/flats.js)                       │
│   ├── System Settings (server/settings.js)                             │
│   └── Backup & Restore Engine (server/backup.js)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Synchronous C-Binding (WAL Mode)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Persistent Storage Tier                        │
│                                                                        │
│   SQLite Database (data/tazmohal.sqlite) [Protected by .gitignore]     │
│   Automated Snapshot Archives (backups/*.sqlite & *.json)              │
└────────────────────────────────────────────────────────────────────────┘
```

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Runtime** | **Node.js (v22+ / v24)** | Modern, fast JavaScript runtime with native standard libraries. |
| **Backend** | **Express.js** | Minimalist, reliable, enterprise-standard REST API framework. |
| **Database** | **SQLite (`node:sqlite`)** | Native zero-dependency embedded database; ACID compliant, blazing fast WAL mode. |
| **Security** | **Bcryptjs & JWT** | Strong password hashing and secure tokenized session handling. |
| **Frontend** | **Vanilla ES6+ & CSS3** | Zero build step required; instant loading, light/dark mode, fully responsive. |
| **Spreadsheets** | **SheetJS (xlsx)** | Comprehensive client and server-side `.xlsx` generation. |

---

## ✨ Core Features

### 1. 🏠 Multi-Flat Management (Flats 1 to 9)
- Dedicated cards for Flat 1 through Flat 9.
- Custom tenant names, contact telephone numbers, and notes.
- Default rent presets that automatically populate upon month selection.

### 2. ⚡ Live Debounced Auto-Save
- Type in any meter reading, rent, or due field: changes are queued and saved within 600ms.
- Visual save badge in header reflects real-time synchronization:
  - `<span>💾</span> All changes saved`
  - `<span>⏳</span> Saving...`
  - `<span>❌</span> Save failed (retry)`

### 3. 📊 Monthly & Yearly History
- Dedicated **History Portal** (`history.html`) with yearly filtering.
- Compare consumption between months.
- Lifetime billed vs collected financial metrics.
- Export entire annual statements into consolidated Excel workbooks.

### 4. 🖨️ Printable Tenant Invoices & Receipts
- Click **"🖨️ Receipt"** on any flat to generate an itemized, print-ready formal invoice.
- Optimized for standard desktop printing or direct export to PDF.

### 5. 📦 1-Click LocalStorage Migration
- Detects if historical records exist in your browser's `localStorage` from older versions.
- A one-click migration banner imports all legacy records directly into SQLite.

---

## 🧮 Billing Logic & Mathematical Formula

All financial calculations are processed through `server/calculator.js` with rounding to 2 decimal places to prevent floating-point calculation drift:

$$\text{Units Consumed} = \max(0, \text{Current Meter Reading} - \text{Previous Meter Reading})$$

$$\text{Electricity Bill} = (\text{Units Consumed} \times \text{Unit Rate}) + \text{Base Meter Charge}$$

$$\text{Total Payable} = \text{Electricity Bill} + \text{House Rent} + \text{Previous Due}$$

$$\text{Outstanding Balance} = \text{Total Payable} - \text{Amount Paid}$$

### Input Validation Guards:
- **Inverted Readings Guard**: If $\text{Current Reading} < \text{Previous Reading}$, units consumed defaults to $0$, and an alert indicator is displayed.
- **Non-Negative Guard**: Negative values for readings, rents, or dues are strictly disallowed.
- **Automatic Status Transition**:
  - If $\text{Amount Paid} \ge \text{Total Payable} \implies \textbf{Paid}$
  - If $0 < \text{Amount Paid} < \text{Total Payable} \implies \textbf{Partial}$
  - If $\text{Amount Paid} = 0 \implies \textbf{Unpaid}$

---

## 🗄️ Database Schema & Storage

The database is stored in `data/tazmohal.sqlite` (isolated from Git).

### Schema Tables:
1. `flats`: Stores IDs 1 through 9, flat names, tenant names, phone numbers, default monthly rents, and notes.
2. `settings`: Key-value store for `unit_rate` (default ৳10), `meter_charge` (default ৳60), property details, and currency symbol.
3. `billing_records`: Stores month (`YYYY-MM`), flat ID, previous reading, current reading, units used, electricity bill, house rent, due amount, total payable, amount paid, payment status, and timestamp. Enforces `UNIQUE(month, flat_id)`.
4. `users`: Stores admin credentials with salted `bcrypt` password hashes.
5. `audit_logs`: Audit trail tracking logins, updates, snapshots, and restorations.

---

## 🚀 Installation & Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v22.0.0 or higher (v24 recommended).
- Git.

### 1. Clone & Setup
```bash
git clone https://github.com/mahin1710/TazMohal-3-Bill-Website.git
cd TazMohal-3-Bill-Website
```

### 2. Install Dependencies
```powershell
# Windows PowerShell
npm.cmd install

# Linux / macOS
npm install
```

### 3. Start the Server
```powershell
npm.cmd start
```
The server will start at:
- **Web Portal:** `http://localhost:3000`
- **Health Check:** `http://localhost:3000/api/health`

---

## ⚙️ Configuration & Environment Variables

Create an optional `.env` file in the root directory (already excluded by `.gitignore`):

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=your_super_secret_jwt_key_here_min_32_chars
```

---

## 🔐 Default Credentials & Authentication

- **Default Username:** `admin`
- **Default Password:** `admin123`
- **Login Portal:** `http://localhost:3000/login.html`

> [!IMPORTANT]
> Immediately upon first login, navigate to **Settings & Backups** (`settings.html`) and update the admin password.

---

## 📊 Excel & PDF Statement Exports

1. **Monthly Excel Sheet:** Click **"Download Month Excel"** from the Dashboard or Summary page to export all 9 flats with itemized formulas and totals.
2. **Yearly Excel Master:** Navigate to **History** (`history.html`), select a year, and click **"Export Yearly Master Excel"**.
3. **Printable Invoices / PDF:** Click **"🖨️ Receipt"** on any flat card to open a pre-formatted invoice and print or save as PDF (`Ctrl + P`).

---

## 🛡️ Backup & Disaster Recovery

### Automatic Backups:
- The server automatically captures daily SQLite database snapshots when running continuously.

### Manual Backups:
- Open **Settings & Backups** (`settings.html`) and click **"⚡ Create New Snapshot"**.
- Backups are stored in `backups/` as both native `.sqlite` images and portable `.json` dumps.
- To download a backup file to your local computer, click **"Download"** next to any snapshot.

### Safe Restore:
- To restore, click **"Restore"** on any listed backup.
- **Pre-Restore Safety Net:** The system automatically creates a safety snapshot of the active database *before* restoring, ensuring zero accidental data loss.

---

## 🔒 Security Perimeter & GitHub Safety

Private household financial records and server secrets are strictly guarded:

- **`.gitignore` Enforcement:** The `data/` directory (`*.sqlite`, `*.db`), `backups/`, `.env`, and private exported files are barred from Git tracking.
- **`auto-sync.ps1` Defense-in-Depth:** The automated 10-minute sync script actively scans `git status` for database or secret files. If any sensitive file is detected, it cancels the push and raises an immediate security alert.
- **Rate Limiting:** Authentication routes are protected against brute-force attacks via sliding window rate-limiting.
- **SQL Injection Prevention:** All SQL queries use parameterized prepared statements (`node:sqlite` statements).

---

## 🧪 Automated Verification Tests

A comprehensive test suite verifies billing math, security guards, database integrity, and backups:

```powershell
# Run the test suite
node test/system.test.js
```

### Test Results:
```text
==================================================
 Running TazMohal-3 Verification Test Suite
==================================================
 ✅ PASS: Calculator: Normal billing calculation with default tariff
 ✅ PASS: Calculator: Inverted readings guard (Current < Previous)
 ✅ PASS: Calculator: Payment status tracking (Paid, Partial, Unpaid)
 ✅ PASS: Calculator: Currency precision & floating point rounding
 ✅ PASS: Database: 9 Flats seeded and structured
 ✅ PASS: Database: Default settings configured
 ✅ PASS: Database: Save & update billing record (UPSERT)
 ✅ PASS: Security: Admin account hashed with bcrypt (no plain text)
 ✅ PASS: Security: .gitignore protects database and backup files
 ✅ PASS: Backup: Snapshot generation creates valid backup file
==================================================
 Summary: 10 / 10 Tests Passed successfully!
==================================================
```

---

## 📂 File Inventory & Changelog

```plaintext
TazMohal-3-Bill-Website/
├── server/
│   ├── index.js           # Express app, middlewares, static routes, auto-backup daemon
│   ├── db.js              # SQLite database schema, WAL mode, seeds & helper methods
│   ├── calculator.js      # Strict tariff calculation engine & floating-point controls
│   ├── auth.js            # Bcrypt password hashing, JWT tokens, login rate limiting
│   ├── billing.js         # Month billing records, debounced auto-save & localStorage migration
│   ├── flats.js           # Flat directory & tenant metadata APIs
│   ├── settings.js        # Dynamic tariff & property configuration APIs
│   └── backup.js          # Snapshot creation, JSON dumps & pre-restore safety checkpoints
│
├── public/
│   ├── index.html         # Modernized Dashboard with debounced live auto-save
│   ├── summary.html       # Monthly Billing Summary & Analytics (resolves 404!)
│   ├── details.html       # Detailed electricity meter consumption table
│   ├── history.html       # Monthly & Yearly billing history archives & search
│   ├── settings.html      # Tariff settings, flat config & backup restore portal
│   ├── login.html         # Secure admin login portal
│   ├── css/
│   │   └── modern.css     # Clean CSS, CSS variables, dark/light theme, print stylesheet
│   └── js/
│       ├── api.js         # Centralized REST client with debounced auto-save queue
│       ├── app.js         # Dashboard controller, live calculation & migration trigger
│       └── reports.js     # SheetJS Excel exporter & printable PDF invoice generator
│
├── summary.html           # Root-level summary page for backward compatibility
├── test/
│   └── system.test.js     # 10-test automated verification suite
├── .gitignore             # Strict security boundary guarding database & credentials
├── auto-sync.ps1          # Security-guarded 10-minute auto git sync script
├── package.json           # Node.js project manifest & scripts
└── README.md              # Comprehensive master system documentation
```

---

## 📍 Property & Maintainer

- **Property:** TazMohal-3
- **Location:** Uttarkhan, Uttara, Dhaka-1230, Bangladesh
- **Developer / Maintainer:** [Md. Mahedi Hasan Mahin](https://github.com/mahin1710)
