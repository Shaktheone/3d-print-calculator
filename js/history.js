/**
 * history.js — Order history with search & filter
 */

const History = {
    /** Get Bootstrap button class for a status */
    statusBtnClass(status) {
        const map = { 'pending': 'btn-warning', 'in-progress': 'btn-info', 'completed': 'btn-success', 'cancelled': 'btn-danger' };
        return map[status] || 'btn-secondary';
    },
    /** Get icon for a status */
    statusIcon(status) {
        const map = { 'pending': '<i class="bi bi-hourglass"></i>', 'in-progress': '<i class="bi bi-play-circle"></i>', 'completed': '<i class="bi bi-check-circle"></i>', 'cancelled': '<i class="bi bi-x-circle"></i>' };
        return map[status] || '<i class="bi bi-question-circle"></i>';
    },
    /** Get readable label for a status */
    statusLabel(status) {
        const map = { 'pending': 'Pending', 'in-progress': 'In Progress', 'completed': 'Completed', 'cancelled': 'Cancelled' };
        return map[status] || status || '—';
    },

    /** Render the history table */
    async render() {
        const orders = await DB.getAll('orders');
        const clients = await DB.getAll('clients');
        const clientMap = {};
        clients.forEach(c => clientMap[c.id] = c.name);

        const search = (Utils.getVal('history-search') || '').toLowerCase();
        const statusFilter = Utils.getVal('history-status');

        let filtered = orders;
        if (statusFilter) {
            filtered = filtered.filter(o => o.status === statusFilter);
        }
        if (search) {
            filtered = filtered.filter(o => {
                const clientName = (clientMap[o.clientId] || '').toLowerCase();
                const modelNames = (o.models || []).map(m => m.name.toLowerCase()).join(' ');
                return clientName.includes(search) || modelNames.includes(search) || o.id.toLowerCase().includes(search);
            });
        }

        // Sort newest first
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        const tbody = document.querySelector('#history-table tbody');
        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="bi bi-clock-history fs-3 d-block mb-2"></i>No orders found.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(o => {
            const modelCount = (o.models || []).length;
            const modelNames = (o.models || []).map(m => m.name || 'Unnamed').join(', ');
            return `
        <tr>
          <td class="fw-semibold">${Utils.escapeHtml(o.id.slice(0, 8))}</td>
          <td>${Utils.formatDate(o.date)}</td>
          <td>${Utils.escapeHtml(clientMap[o.clientId] || '—')}</td>
          <td title="${Utils.escapeHtml(modelNames)}">${modelCount} model${modelCount !== 1 ? 's' : ''}</td>
          <td>
            <div class="dropdown">
              <button class="btn ${History.statusBtnClass(o.status)} dropdown-toggle fw-bold" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Click to change status" style="min-width:130px; padding:6px 14px; font-size:0.9rem;">
                ${History.statusIcon(o.status)} ${History.statusLabel(o.status)}
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><button class="dropdown-item${o.status === 'pending' ? ' active' : ''}" type="button" onclick="event.stopPropagation(); History.setStatus('${o.id}','pending')"><i class="bi bi-hourglass me-2 text-warning"></i>Pending</button></li>
                <li><button class="dropdown-item${o.status === 'in-progress' ? ' active' : ''}" type="button" onclick="event.stopPropagation(); History.setStatus('${o.id}','in-progress')"><i class="bi bi-play-circle me-2 text-info"></i>In Progress</button></li>
                <li><button class="dropdown-item${o.status === 'completed' ? ' active' : ''}" type="button" onclick="event.stopPropagation(); History.setStatus('${o.id}','completed')"><i class="bi bi-check-circle me-2 text-success"></i>Completed</button></li>
                <li><button class="dropdown-item${o.status === 'cancelled' ? ' active' : ''}" type="button" onclick="event.stopPropagation(); History.setStatus('${o.id}','cancelled')"><i class="bi bi-x-circle me-2 text-danger"></i>Cancelled</button></li>
              </ul>
            </div>
          </td>
          <td class="text-end gel-value">${Utils.formatGEL(o.totalPrice || 0)}</td>
          <td class="text-center actions-cell">
            <button class="btn btn-sm btn-outline-dark me-1" onclick="History.exportPDF('${o.id}')" title="Download Invoice"><i class="bi bi-file-earmark-pdf"></i></button>
            <button class="btn btn-sm btn-outline-primary me-1" onclick="Orders.loadOrder('${o.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-info me-1" onclick="History.viewDetails('${o.id}')" title="View details"><i class="bi bi-eye"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="History.remove('${o.id}')" title="Delete"><i class="bi bi-trash"></i></button>
          </td>
        </tr>
      `;
        }).join('');
    },

    /** Update order status */
    async setStatus(id, status) {
        const order = await DB.get('orders', id);
        if (!order) return;
        order.status = status;
        await DB.put('orders', order);
        Utils.showToast(`Order status: ${status}`);
        this.render();
    },

    /** View order details in an alert-style summary */
    async viewDetails(id) {
        const order = await DB.get('orders', id);
        if (!order) return;
        const clients = await DB.getAll('clients');
        const clientMap = {};
        clients.forEach(c => clientMap[c.id] = c.name);

        const printers = await DB.getAll('printers');
        const materials = await DB.getAll('materials');
        const printerMap = {};
        printers.forEach(p => printerMap[p.id] = p.name);
        const materialMap = {};
        materials.forEach(m => materialMap[m.id] = m.type);

        let details = `Order: ${order.id.slice(0, 8)}\n`;
        details += `Client: ${clientMap[order.clientId] || '—'}\n`;
        details += `Date: ${Utils.formatDate(order.date)}\n`;
        details += `Status: ${order.status}\n`;
        details += `Margin: ${order.marginPct}% | Tax: ${order.taxPct}% | Discount: ${order.discountPct}%\n`;
        details += `Logistics: ${Utils.formatGEL(order.logisticsCost)}\n\n`;

        (order.models || []).forEach((m, i) => {
            details += `Model ${i + 1}: ${m.name || 'Unnamed'}\n`;
            details += `  Weight: ${m.weightG}g | Time: ${m.estTimeHrs}h\n`;
            details += `  Printer: ${printerMap[m.printerId] || '?'} | Material: ${materialMap[m.materialId] || '?'}\n`;
            if (m.extras?.length) {
                details += `  Extras: ${m.extras.map(e => `${e.label} ${Utils.formatGEL(e.cost)}`).join(', ')}\n`;
            }
        });

        details += `\nTotal Cost: ${Utils.formatGEL(order.totalCost || 0)}`;
        details += `\nTotal Price: ${Utils.formatGEL(order.totalPrice || 0)}`;
        details += `\nProfit: ${Utils.formatGEL(order.profit || 0)}`;

        alert(details);
    },

    /** Generate and download PDF invoice */
    async exportPDF(id) {
        const order = await DB.get('orders', id);
        if (!order) return;
        const client = await DB.get('clients', order.clientId);
        const printerMap = {};
        (await DB.getAll('printers')).forEach(p => printerMap[p.id] = p.name);
        const materialMap = {};
        (await DB.getAll('materials')).forEach(m => materialMap[m.id] = m.type);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Header
        doc.setFontSize(22);
        doc.text("3D Print Service Invoice", 14, 20);

        doc.setFontSize(10);
        doc.text(`Invoice #: ${order.id.slice(0, 8).toUpperCase()}`, 14, 30);
        doc.text(`Date: ${Utils.formatDate(order.date)}`, 14, 35);
        doc.text(`Status: ${order.status}`, 14, 40);

        // Client Info
        if (client) {
            doc.text("Bill To:", 140, 30);
            doc.setFontSize(12);
            doc.text(client.name, 140, 36);
            doc.setFontSize(10);
            if (client.email) doc.text(client.email, 140, 42);
            if (client.phone) doc.text(client.phone, 140, 47);
        }

        // Table
        const tableBody = (order.models || []).map((m, i) => [
            i + 1,
            m.name || 'Unnamed Model',
            `${printerMap[m.printerId] || '-'} / ${materialMap[m.materialId] || '-'}`,
            `${m.weightG}g / ${m.estTimeHrs}h`,
            Utils.formatGEL(m.subtotal)
        ]);

        doc.autoTable({
            startY: 55,
            head: [['#', 'Item', 'Details', 'Specs', 'Cost']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [66, 66, 66] }
        });

        // Totals
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.text(`Subtotal: ${Utils.formatGEL(order.totalCost)}`, 140, finalY);
        doc.text(`Margin (${order.marginPct}%): +${Utils.formatGEL(order.totalCost * (order.marginPct / 100))}`, 140, finalY + 5);
        doc.text(`Tax (${order.taxPct}%): +${Utils.formatGEL(order.totalPrice - (order.totalPrice / (1 + order.taxPct / 100)))}`, 140, finalY + 10);

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(`Total: ${Utils.formatGEL(order.totalPrice)}`, 140, finalY + 20);

        doc.save(`Invoice_${order.id.slice(0, 8)}.pdf`);
        Utils.showToast('PDF downloaded');
    },

    /** Delete an order */
    async remove(id) {
        document.getElementById('confirm-message').textContent = `Delete order ${id.slice(0, 8)}?`;
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        document.getElementById('confirm-btn').onclick = async () => {
            await DB.del('orders', id);
            modal.hide();
            Utils.showToast('Order deleted', 'warning');
            this.render();
        };
        modal.show();
    }
};
