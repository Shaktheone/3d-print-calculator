/**
 * materials.js — Materials CRUD for 3D Print Cost Calculator
 */

const Materials = {
    /** Render materials table */
    async render() {
        const materials = await DB.getAll('materials');
        const tbody = document.querySelector('#materials-table tbody');
        if (!materials.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><i class="bi bi-box-seam fs-3 d-block mb-2"></i>No materials yet. Click "Add Material" to start.</td></tr>`;
            return;
        }
        tbody.innerHTML = materials.map(m => `
      <tr>
        <td class="fw-semibold">${Utils.escapeHtml(m.type)}</td>
        <td class="text-end gel-value">${Utils.formatGEL(m.pricePerKg)}</td>
        <td class="text-end">${m.densityGCm3}</td>
        <td class="text-end">${m.stockKg} kg</td>
        <td>${Utils.escapeHtml(m.color || '—')}</td>
        <td class="text-center actions-cell">
          <button class="btn btn-sm btn-outline-primary me-1" onclick="Materials.openModal('${m.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="Materials.remove('${m.id}')" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
    },

    /** Open add/edit modal */
    async openModal(id) {
        const modal = new bootstrap.Modal(document.getElementById('materialModal'));
        document.getElementById('materialModalTitle').textContent = id ? 'Edit Material' : 'Add Material';

        if (id) {
            const m = await DB.get('materials', id);
            if (!m) return;
            Utils.setVal('material-id', m.id);
            Utils.setVal('material-type', m.type);
            Utils.setVal('material-price', m.pricePerKg);
            Utils.setVal('material-density', m.densityGCm3);
            Utils.setVal('material-stock', m.stockKg);
            Utils.setVal('material-color', m.color || '');
        } else {
            Utils.setVal('material-id', '');
            Utils.setVal('material-type', 'PLA');
            Utils.setVal('material-price', 55);
            Utils.setVal('material-density', 1.24);
            Utils.setVal('material-stock', 1.0);
            Utils.setVal('material-color', 'White');
        }
        modal.show();
    },

    /** Save material */
    async save() {
        const type = Utils.getVal('material-type');
        if (!type) { Utils.showToast('Material type is required', 'error'); return; }

        const data = {
            id: Utils.getVal('material-id') || Utils.generateId(),
            type,
            pricePerKg: Utils.parseNum(Utils.getVal('material-price'), 55),
            densityGCm3: Utils.parseNum(Utils.getVal('material-density'), 1.24),
            stockKg: Utils.parseNum(Utils.getVal('material-stock'), 1),
            color: Utils.getVal('material-color')
        };

        await DB.put('materials', data);
        bootstrap.Modal.getInstance(document.getElementById('materialModal')).hide();
        Utils.showToast(`Material "${type}" saved`);
        this.render();
    },

    /** Delete a material */
    async remove(id) {
        const m = await DB.get('materials', id);
        if (!m) return;
        document.getElementById('confirm-message').textContent = `Delete material "${m.type}"?`;
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        document.getElementById('confirm-btn').onclick = async () => {
            await DB.del('materials', id);
            modal.hide();
            Utils.showToast(`Material "${m.type}" deleted`, 'warning');
            this.render();
        };
        modal.show();
    }
};
