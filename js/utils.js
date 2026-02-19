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
     * Sort an HTML table by clicking a header
     * @param {string} tableId
     * @param {number} colIdx
     * @param {'text'|'number'|'currency'|'date'} type
     */
    sortHTMLTable(tableId, colIdx, type = 'text') {
        const table = document.getElementById(tableId);
        if (!table) return;
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const th = table.querySelectorAll('th')[colIdx];
        const isAsc = th.dataset.order === 'asc';
        const multiplier = isAsc ? -1 : 1; // Toggle order

        // Update sort icons
        table.querySelectorAll('th i').forEach(i => i.remove());
        table.querySelectorAll('th').forEach(h => h.dataset.order = '');
        th.dataset.order = isAsc ? 'desc' : 'asc';
        const icon = document.createElement('i');
        icon.className = isAsc ? 'bi bi-sort-down ms-1' : 'bi bi-sort-up ms-1';
        th.appendChild(icon);

        rows.sort((rowA, rowB) => {
            const cellA = rowA.children[colIdx].textContent.trim();
            const cellB = rowB.children[colIdx].textContent.trim();
            let a = cellA, b = cellB;

            if (type === 'number') {
                a = parseFloat(cellA.replace(/[^0-9.-]+/g, '')) || 0;
                b = parseFloat(cellB.replace(/[^0-9.-]+/g, '')) || 0;
            } else if (type === 'currency') {
                a = parseFloat(cellA.replace(/[^0-9.-]+/g, '')) || 0;
                b = parseFloat(cellB.replace(/[^0-9.-]+/g, '')) || 0;
            } else if (type === 'date') {
                a = new Date(cellA).getTime() || 0;
                b = new Date(cellB).getTime() || 0;
            } else {
                return a.localeCompare(b) * multiplier;
            }
            return (a - b) * multiplier;
        });

        rows.forEach(row => tbody.appendChild(row));
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
