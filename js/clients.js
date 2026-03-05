/**
 * clients.js — Client CRUD for 3D Print Cost Calculator
 */

const Clients = {
    /** Render clients table */
    async render() {
        const clients = await DB.getAll('clients');
        const tbody = document.querySelector('#clients-table tbody');
        if (!clients.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted"><i class="bi bi-people fs-3 d-block mb-2"></i>No clients yet.</td></tr>`;
            return;
        }
        tbody.innerHTML = clients.map(c => `
      <tr>
        <td class="fw-semibold" data-label="Name">${Utils.escapeHtml(c.name)}</td>
        <td data-label="Email">${Utils.escapeHtml(c.email || '—')}</td>
        <td data-label="Phone">${Utils.escapeHtml(c.phone || '—')}</td>
        <td data-label="Notes">${Utils.escapeHtml(c.notes || '—')}</td>
        <td class="text-center actions-cell" data-label="">
          <button class="btn btn-sm btn-outline-primary me-1" onclick="Clients.openModal('${c.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="Clients.remove('${c.id}')" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
    },

    /** Open add/edit modal */
    async openModal(id) {
        const modal = new bootstrap.Modal(document.getElementById('clientModal'));
        document.getElementById('clientModalTitle').textContent = id ? 'Edit Client' : 'Add Client';

        if (id) {
            const c = await DB.get('clients', id);
            if (!c) return;
            Utils.setVal('client-id', c.id);
            Utils.setVal('client-name', c.name);
            Utils.setVal('client-email', c.email || '');
            Utils.setVal('client-phone', c.phone || '');
            Utils.setVal('client-notes', c.notes || '');
        } else {
            Utils.setVal('client-id', '');
            Utils.setVal('client-name', '');
            Utils.setVal('client-email', '');
            Utils.setVal('client-phone', '');
            Utils.setVal('client-notes', '');
        }
        modal.show();
    },

    /** Save client */
    async save() {
        const name = Utils.getVal('client-name').trim();
        if (!name) { Utils.showToast('Client name is required', 'error'); return; }

        const data = {
            id: Utils.getVal('client-id') || Utils.generateId(),
            name,
            email: Utils.getVal('client-email'),
            phone: Utils.getVal('client-phone'),
            notes: Utils.getVal('client-notes')
        };

        await DB.put('clients', data);
        bootstrap.Modal.getInstance(document.getElementById('clientModal')).hide();
        Utils.showToast(`Client "${name}" saved`);
        this.render();
    },

    /** Delete a client */
    async remove(id) {
        const c = await DB.get('clients', id);
        if (!c) return;
        document.getElementById('confirm-message').textContent = `Delete client "${c.name}"?`;
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        document.getElementById('confirm-btn').onclick = async () => {
            await DB.del('clients', id);
            modal.hide();
            Utils.showToast(`Client "${c.name}" deleted`, 'warning');
            this.render();
        };
        modal.show();
    },

    /** Get a client name by ID (for display) */
    async getName(id) {
        const c = await DB.get('clients', id);
        return c ? c.name : 'Unknown';
    }
};
