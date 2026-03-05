/**
 * overheads.js — Overheads & Expenses CRUD
 * Overheads = monthly recurring costs (rent, internet)
 * Expenses  = one-time costs (nozzle, tool purchase, repairs)
 */

const Overheads = {
    modal: null,

    /** Render both tables */
    async render() {
        this.modal = this.modal || new bootstrap.Modal(document.getElementById('overheadModal'));

        /* ---------- Overheads table ---------- */
        const overheads = await DB.getAll('overheads');
        const tbody = document.querySelector('#overheads-table tbody');
        if (overheads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No overheads yet</td></tr>';
        } else {
            tbody.innerHTML = overheads.map(o => `<tr>
                <td data-label="Label">${Utils.escapeHtml(o.label)}</td>
                <td class="text-end fw-bold" data-label="Amount">${Utils.formatGEL(o.amountPerMonth)}</td>
                <td data-label="Scope"><span class="badge bg-info">${Utils.escapeHtml(o.scope)}</span></td>
                <td class="text-center actions-cell" data-label="">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="Overheads.openModal('${o.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="Overheads.remove('${o.id}', 'overheads')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`).join('');
        }

        /* ---------- Expenses table ---------- */
        const expenses = await DB.getAll('expenses');
        const eTbody = document.querySelector('#expenses-table tbody');
        if (expenses.length === 0) {
            eTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No expenses yet — click + Add Expense</td></tr>';
        } else {
            // Sort newest first
            expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            eTbody.innerHTML = expenses.map(e => `<tr>
                <td data-label="Date">${Utils.formatDate(e.date)}</td>
                <td data-label="Label">${Utils.escapeHtml(e.label)}</td>
                <td data-label="Category"><span class="badge bg-warning text-dark">${Utils.escapeHtml(e.category || '—')}</span></td>
                <td class="text-end fw-bold" data-label="Amount">${Utils.formatGEL(e.amount)}</td>
                <td class="text-muted small" data-label="Notes">${Utils.escapeHtml(e.notes || '')}</td>
                <td class="text-center actions-cell" data-label="">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="Overheads.openModal('${e.id}', 'expense')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="Overheads.remove('${e.id}', 'expenses')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`).join('');
        }

        // Expenses total
        const totalExp = expenses.reduce((sum, e) => sum + Utils.parseNum(e.amount), 0);
        document.getElementById('expenses-total').textContent = Utils.formatGEL(totalExp);

        // Load global settings into the rate fields
        const settings = await DB.getSettings();
        document.getElementById('electricity-rate').value = settings.electricityPerKwh;
        document.getElementById('working-hours').value = settings.workingHoursPerMonth;
    },

    /** Save global electricity rate and working hours */
    async saveGlobals() {
        const settings = await DB.getSettings();
        settings.electricityPerKwh = Utils.parseNum(document.getElementById('electricity-rate').value);
        settings.workingHoursPerMonth = Utils.parseNum(document.getElementById('working-hours').value);
        await DB.put('settings', settings);
        Utils.showToast('Rates saved');
    },

    /** Toggle form fields based on type (overhead vs expense) */
    toggleFormType(type) {
        const isExpense = type === 'expense';
        document.getElementById('overhead-entry-type').value = type;

        // Date: show only for expense
        document.getElementById('overhead-date-group').classList.toggle('d-none', !isExpense);

        // Amount label
        document.getElementById('overhead-amount-label').textContent = isExpense ? 'Amount ₾' : 'Amount ₾/month';

        // Scope: hide for expense
        document.getElementById('overhead-scope-group').classList.toggle('d-none', isExpense);

        // Modal title
        document.getElementById('overheadModalTitle').textContent =
            document.getElementById('overhead-id').value ? `Edit ${isExpense ? 'Expense' : 'Overhead'}` : `Add ${isExpense ? 'Expense' : 'Overhead'}`;
    },

    /** Open modal for add/edit */
    async openModal(id = null, defaultType = 'overhead') {
        this.modal = this.modal || new bootstrap.Modal(document.getElementById('overheadModal'));

        // Reset form
        document.getElementById('overhead-id').value = '';
        document.getElementById('overhead-label').value = '';
        document.getElementById('overhead-category').value = '';
        document.getElementById('overhead-amount').value = '0';
        document.getElementById('overhead-scope').value = 'global';
        document.getElementById('overhead-notes').value = '';
        document.getElementById('overhead-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('overhead-type').value = defaultType;
        this.toggleFormType(defaultType);

        // Populate scope dropdown with printer options
        const printers = await DB.getAll('printers');
        const scopeSelect = document.getElementById('overhead-scope');
        scopeSelect.innerHTML = '<option value="global">Global</option>' +
            printers.map(p => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('');

        if (id) {
            // Determine which store to look in
            let item;
            if (defaultType === 'expense') {
                item = await DB.get('expenses', id);
            } else {
                item = await DB.get('overheads', id);
            }
            if (item) {
                document.getElementById('overhead-id').value = item.id;
                document.getElementById('overhead-label').value = item.label || '';
                document.getElementById('overhead-category').value = item.category || '';
                document.getElementById('overhead-notes').value = item.notes || '';

                if (defaultType === 'expense') {
                    document.getElementById('overhead-amount').value = item.amount || 0;
                    document.getElementById('overhead-date').value = item.date || '';
                } else {
                    document.getElementById('overhead-amount').value = item.amountPerMonth || 0;
                    document.getElementById('overhead-scope').value = item.scope || 'global';
                }
            }
        }

        document.getElementById('overheadModalTitle').textContent = id
            ? `Edit ${defaultType === 'expense' ? 'Expense' : 'Overhead'}`
            : `Add ${defaultType === 'expense' ? 'Expense' : 'Overhead'}`;

        this.modal.show();
    },

    /** Save overhead or expense */
    async save() {
        const entryType = document.getElementById('overhead-entry-type').value;
        const label = document.getElementById('overhead-label').value.trim();
        if (!label) { Utils.showToast('Label is required', 'warning'); return; }

        const id = document.getElementById('overhead-id').value || Utils.generateId();

        if (entryType === 'expense') {
            const expense = {
                id,
                label,
                category: document.getElementById('overhead-category').value.trim(),
                amount: Utils.parseNum(document.getElementById('overhead-amount').value),
                date: document.getElementById('overhead-date').value,
                notes: document.getElementById('overhead-notes').value.trim()
            };
            await DB.put('expenses', expense);
            Utils.showToast('Expense saved');
        } else {
            const overhead = {
                id,
                label,
                category: document.getElementById('overhead-category').value.trim(),
                amountPerMonth: Utils.parseNum(document.getElementById('overhead-amount').value),
                scope: document.getElementById('overhead-scope').value,
                notes: document.getElementById('overhead-notes').value.trim()
            };
            await DB.put('overheads', overhead);
            Utils.showToast('Overhead saved');
        }

        this.modal.hide();
        this.render();
    },

    /** Remove an item from either store */
    async remove(id, store = 'overheads') {
        document.getElementById('confirm-message').textContent =
            `Delete this ${store === 'expenses' ? 'expense' : 'overhead'}?`;
        const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
        document.getElementById('confirm-btn').onclick = async () => {
            await DB.del(store, id);
            confirmModal.hide();
            Utils.showToast('Deleted');
            this.render();
        };
        confirmModal.show();
    },

    /** Get total monthly overheads (used by order calculation engine) */
    async getTotalMonthly() {
        const overheads = await DB.getAll('overheads');
        return overheads.reduce((sum, o) => sum + Utils.parseNum(o.amountPerMonth), 0);
    }
};
