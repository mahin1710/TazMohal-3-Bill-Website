// public/js/api.js
// Centralized API Client with Debounced Auto-Save & State Synchronization

const API = {
  saveTimeouts: new Map(),
  saveQueue: new Map(),

  // Update global UI save indicator
  setSaveStatus(status, text = '') {
    const badge = document.getElementById('globalSaveBadge');
    if (!badge) return;

    badge.className = 'save-badge ' + status;
    if (status === 'saving') {
      badge.innerHTML = `<span>⏳</span> Saving...`;
    } else if (status === 'saved') {
      badge.innerHTML = `<span>💾</span> All changes saved`;
    } else if (status === 'error') {
      badge.innerHTML = `<span>❌</span> ${text || 'Save failed'}`;
    } else {
      badge.innerHTML = `<span>💾</span> Ready`;
    }
  },

  // Generic fetch wrapper
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    options.headers = { ...defaultHeaders, ...options.headers };
    options.credentials = 'include'; // Send cookies

    try {
      const res = await fetch(endpoint, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, err);
      throw err;
    }
  },

  // Billing APIs
  async getMonthBilling(month) {
    return this.request(`/api/billing/month/${month}`);
  },

  async saveEntireMonth(month, flats) {
    this.setSaveStatus('saving');
    try {
      const res = await this.request('/api/billing/save-month', {
        method: 'POST',
        body: JSON.stringify({ month, flats })
      });
      this.setSaveStatus('saved');
      return res;
    } catch (err) {
      this.setSaveStatus('error', 'Bulk save failed');
      throw err;
    }
  },

  // Debounced auto-save for an individual flat
  queueAutoSaveFlat(flatData, onSavedCallback) {
    const key = `${flatData.month}_${flatData.flat_id}`;
    this.saveQueue.set(key, flatData);
    this.setSaveStatus('saving');

    if (this.saveTimeouts.has(key)) {
      clearTimeout(this.saveTimeouts.get(key));
    }

    const timer = setTimeout(async () => {
      this.saveTimeouts.delete(key);
      const dataToSave = this.saveQueue.get(key);
      if (!dataToSave) return;

      try {
        const res = await this.request('/api/billing/save-flat', {
          method: 'POST',
          body: JSON.stringify(dataToSave)
        });

        this.saveQueue.delete(key);
        if (this.saveQueue.size === 0) {
          this.setSaveStatus('saved');
        }

        if (typeof onSavedCallback === 'function') {
          onSavedCallback(res);
        }
      } catch (err) {
        this.setSaveStatus('error', 'Auto-save failed');
      }
    }, 600); // 600ms debounce interval

    this.saveTimeouts.set(key, timer);
  },

  async getBillingHistory() {
    return this.request('/api/billing/history');
  },

  async recordPayment(payload) {
    return this.request('/api/billing/record-payment', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async deletePayment(id) {
    return this.request(`/api/billing/payment/${id}`, {
      method: 'DELETE'
    });
  },

  async getPaymentReport(month) {
    return this.request(`/api/billing/payment-report/${month}`);
  },

  async getYearlyBilling(year) {
    return this.request(`/api/billing/yearly/${year}`);
  },

  async migrateLocalStorage(data) {
    return this.request('/api/billing/migrate-localstorage', {
      method: 'POST',
      body: JSON.stringify({ data })
    });
  },

  // Settings & Flats
  async getSettings() {
    return this.request('/api/settings');
  },

  async updateSettings(settings) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  async getFlats() {
    return this.request('/api/flats');
  },

  async updateFlat(id, data) {
    return this.request(`/api/flats/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // Backup APIs
  async getBackups() {
    return this.request('/api/backup/list');
  },

  async createBackup() {
    return this.request('/api/backup/create', { method: 'POST' });
  },

  async restoreBackup(filename) {
    return this.request('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ filename })
    });
  },

  // Auth APIs
  async checkAuth() {
    try {
      return await this.request('/api/auth/me');
    } catch {
      return null;
    }
  },

  async login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  }
};

window.API = API;

