/**
 * printers.js — Printer CRUD for 3D Print Cost Calculator
 */

const Printers = {
    /** Render the printers table from IndexedDB */
    async render() {
        const printers = await DB.getAll('printers');
        const tbody = document.querySelector('#printers-table tbody');
        if (!printers.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="bi bi-printer fs-3 d-block mb-2"></i>No printers yet. Click "Add Printer" to start.</td></tr>`;
            return;
        }
        tbody.innerHTML = printers.map(p => `
      <tr>
        <td class="fw-semibold">${Utils.escapeHtml(p.name)}</td>
        <td class="text-end gel-value">${Utils.formatGEL(p.hourlyCost)}</td>
        <td class="text-end">${p.powerW}W</td>
        <td class="text-end gel-value">${Utils.formatGEL(p.maintenanceCostPerHr)}</td>
        <td class="text-end">${p.speedGPerH} g/h</td>
        <td><span class="badge bg-secondary">${Utils.escapeHtml(p.profile)}</span></td>
        <td class="text-center actions-cell">
          <button class="btn btn-sm btn-outline-primary me-1" onclick="Printers.openModal('${p.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="Printers.remove('${p.id}')" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
    },

    /** Open add/edit modal */
    async openModal(id) {
        const modal = new bootstrap.Modal(document.getElementById('printerModal'));
        document.getElementById('printerModalTitle').textContent = id ? 'Edit Printer' : 'Add Printer';

        if (id) {
            const p = await DB.get('printers', id);
            if (!p) return;
            Utils.setVal('printer-id', p.id);
            Utils.setVal('printer-name', p.name);
            Utils.setVal('printer-hourly', p.hourlyCost);
            Utils.setVal('printer-power', p.powerW);
            Utils.setVal('printer-maintenance', p.maintenanceCostPerHr);
            Utils.setVal('printer-speed', p.speedGPerH);
            Utils.setVal('printer-profile', p.profile);
        } else {
            Utils.setVal('printer-id', '');
            Utils.setVal('printer-name', '');
            Utils.setVal('printer-hourly', 15);
            Utils.setVal('printer-power', 350);
            Utils.setVal('printer-maintenance', 0.5);
            Utils.setVal('printer-speed', 30);
            Utils.setVal('printer-profile', 'FDM Standard');
        }
        modal.show();
    },

    /** Save printer from modal form */
    async save() {
        const name = Utils.getVal('printer-name').trim();
        if (!name) { Utils.showToast('Printer name is required', 'error'); return; }

        const data = {
            id: Utils.getVal('printer-id') || Utils.generateId(),
            name,
            hourlyCost: Utils.parseNum(Utils.getVal('printer-hourly'), 15),
            powerW: Utils.parseNum(Utils.getVal('printer-power'), 350),
            maintenanceCostPerHr: Utils.parseNum(Utils.getVal('printer-maintenance'), 0.5),
            speedGPerH: Utils.parseNum(Utils.getVal('printer-speed'), 30),
            profile: Utils.getVal('printer-profile') || 'FDM Standard'
        };

        await DB.put('printers', data);
        bootstrap.Modal.getInstance(document.getElementById('printerModal')).hide();
        Utils.showToast(`Printer "${name}" saved`);
        this.render();
    },

    /** Delete a printer */
    async remove(id) {
        const p = await DB.get('printers', id);
        if (!p) return;
        document.getElementById('confirm-message').textContent = `Delete printer "${p.name}"?`;
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        const btn = document.getElementById('confirm-btn');
        btn.onclick = async () => {
            await DB.del('printers', id);
            modal.hide();
            Utils.showToast(`Printer "${p.name}" deleted`, 'warning');
            this.render();
        };
        modal.show();
    }
};
