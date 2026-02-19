/**
 * utils.js — Shared utilities for 3D Print Cost Calculator
 * Currency: Georgian Lari (₾ GEL)
 */

const Utils = {
    /**
     * Format a number as Georgian Lari (GEL ₾)
     * @param {number} amount
     * @returns {string} e.g. "12.50 ₾"
     */
    formatGEL(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) return '0.00 ₾';
        return num.toFixed(2) + ' ₾';
    },

    /**
     * Generate a unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
    },

    /**
     * Parse a value to number with fallback
     */
    parseNum(val, fallback = 0) {
        const n = parseFloat(val);
        return isNaN(n) ? fallback : n;
    },

    /**
     * Show a Bootstrap toast notification
     * @param {string} message
     * @param {'success'|'error'|'warning'|'info'} type
     */
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const id = 'toast-' + Date.now();
        const icons = { success: 'check-circle-fill', error: 'x-circle-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' };
        const colors = { success: 'text-bg-success', error: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-info' };
        const html = `
      <div id="${id}" class="toast align-items-center ${colors[type] || colors.success} border-0" role="alert" aria-live="assertive">
        <div class="d-flex">
          <div class="toast-body">
            <i class="bi bi-${icons[type] || icons.success} me-2"></i>${message}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`;
        container.insertAdjacentHTML('beforeend', html);
        const toastEl = document.getElementById(id);
        const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
        toast.show();
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Format ISO date string for display
     */
    formatDate(isoStr) {
        if (!isoStr) return '—';
        return new Date(isoStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    /**
     * Get value from a form input by ID
     */
    getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    },

    /**
     * Set value of a form input by ID
     */
    setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    },

    /**
     * Create a tooltip text showing the formula
     */
    formulaTooltip(formula, result) {
        return `${formula} = ${this.formatGEL(result)}`;
    },

    /**
     * Status badge HTML
     */
    statusBadge(status) {
        const map = {
            pending: 'bg-warning text-dark',
            'in-progress': 'bg-info',
            completed: 'bg-success',
            cancelled: 'bg-secondary'
        };
        const cls = map[status] || 'bg-secondary';
        return `<span class="badge ${cls}">${Utils.escapeHtml(status)}</span>`;
    }
};
