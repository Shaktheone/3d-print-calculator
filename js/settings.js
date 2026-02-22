/**
 * settings.js — App settings, export/import, data management
 */

const Settings = {
    /** Load current settings into the form */
    async render() {
        const s = await DB.getSettings();
        Utils.setVal('set-margin', s.defaultMargin || 100);
        Utils.setVal('set-tax', s.defaultTax || 18);
        Utils.setVal('set-electricity', s.electricityPerKwh || 0.18);
        Utils.setVal('set-hours', s.workingHoursPerMonth || 160);
    },

    /** Save default settings */
    async saveDefaults() {
        const s = await DB.getSettings();
        s.defaultMargin = Utils.parseNum(Utils.getVal('set-margin'), 25);
        s.defaultTax = Utils.parseNum(Utils.getVal('set-tax'), 18);
        s.electricityPerKwh = Utils.parseNum(Utils.getVal('set-electricity'), 0.18);
        s.workingHoursPerMonth = Utils.parseNum(Utils.getVal('set-hours'), 160);
        await DB.put('settings', s);
        Utils.showToast('Default settings saved');
    },

    /** Export all data as JSON file download */
    async exportJSON() {
        try {
            const data = await DB.exportAll();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const d = new Date(); const pad = n => String(n).padStart(2, '0');
            const geo = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tbilisi' }));
            const stamp = `${geo.getFullYear()}-${pad(geo.getMonth() + 1)}-${pad(geo.getDate())}_${pad(geo.getHours())}${pad(geo.getMinutes())}`;
            a.download = `3DPrintCalc_Backup_${stamp}.json`;
            a.click();
            URL.revokeObjectURL(url);
            Utils.showToast('Data exported as JSON');
        } catch (e) {
            Utils.showToast('Export failed: ' + e.message, 'error');
        }
    },

    /** Trigger file input for import */
    triggerImport() {
        document.getElementById('import-file').click();
    },

    /** Import data from JSON file */
    async importJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate structure
            const expectedStores = ['printers', 'materials', 'overheads', 'clients', 'orders', 'settings'];
            const hasAny = expectedStores.some(s => data[s]);
            if (!hasAny) {
                Utils.showToast('Invalid backup file format', 'error');
                return;
            }

            await DB.importAll(data);
            Utils.showToast('Data imported successfully!');

            // Refresh current view
            App.refreshCurrentSection();
        } catch (e) {
            Utils.showToast('Import failed: ' + e.message, 'error');
        }

        // Reset file input
        event.target.value = '';
    },

    /** Export orders as CSV */
    async exportCSV() {
        try {
            const orders = await DB.getAll('orders');
            const clients = await DB.getAll('clients');
            const clientMap = {};
            clients.forEach(c => clientMap[c.id] = c.name);

            const printers = await DB.getAll('printers');
            const materials = await DB.getAll('materials');
            const printerMap = {};
            printers.forEach(p => printerMap[p.id] = p.name);
            const materialMap = {};
            materials.forEach(m => materialMap[m.id] = m.type);

            // CSV headers
            let csv = 'Order ID,Date,Client,Status,Margin %,Tax %,Discount %,Logistics ₾,Model,Weight g,Time hrs,Printer,Material,Total Cost ₾,Total Price ₾,Profit ₾\n';

            orders.forEach(o => {
                const client = clientMap[o.clientId] || '';
                (o.models || [{ name: '' }]).forEach(m => {
                    csv += [
                        o.id.slice(0, 8),
                        o.date ? o.date.slice(0, 10) : '',
                        `"${client}"`,
                        o.status,
                        o.marginPct,
                        o.taxPct,
                        o.discountPct,
                        o.logisticsCost || 0,
                        `"${m.name || ''}"`,
                        m.weightG || '',
                        m.estTimeHrs || '',
                        `"${printerMap[m.printerId] || ''}"`,
                        `"${materialMap[m.materialId] || ''}"`,
                        (o.totalCost || 0).toFixed(2),
                        (o.totalPrice || 0).toFixed(2),
                        (o.profit || 0).toFixed(2)
                    ].join(',') + '\n';
                });
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const d = new Date();
            const geo = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tbilisi' }));
            const pad = n => String(n).padStart(2, '0');
            const dateStr = `${geo.getFullYear()}-${pad(geo.getMonth() + 1)}-${pad(geo.getDate())}`;
            a.download = `3DPrintOrders_${dateStr}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            Utils.showToast('Orders exported as CSV');
        } catch (e) {
            Utils.showToast('CSV export failed: ' + e.message, 'error');
        }
    },

    /** Reset all data (with confirmation) */
    async resetData() {
        document.getElementById('confirm-message').textContent = 'This will delete ALL data (printers, materials, orders, etc). Are you sure?';
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        document.getElementById('confirm-btn').onclick = async () => {
            await DB.clearAll();
            await DB.seedIfEmpty();
            modal.hide();
            Utils.showToast('All data reset to defaults', 'info');
            App.refreshCurrentSection();
        };
        modal.show();
    }
};
