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
            // Show consumed stock for this model
            if (order.stockConsumed) {
                const sc = order.stockConsumed.find(s => s.materialId === m.materialId);
                if (sc) {
                    details += `  Consumed from stock: ${sc.consumedKg.toFixed(3)} kg of ${sc.materialType}\n`;
                }
            }
        });

        details += `\nTotal Cost: ${Utils.formatGEL(order.totalCost || 0)}`;
        details += `\nTotal Price: ${Utils.formatGEL(order.totalPrice || 0)}`;
        details += `\nProfit: ${Utils.formatGEL(order.profit || 0)}`;

        alert(details);
    },

    /** Load Georgian-compatible font into jsPDF (cached) */
    _fontLoaded: false,
    _georgianAvailable: false,
    async _loadGeorgianFont(doc) {
        if (this._fontLoaded) {
            // Re-register for new doc instance
            if (this._cachedBase64) {
                doc.addFileToVFS('NotoSansGeorgian.ttf', this._cachedBase64);
                doc.addFont('NotoSansGeorgian.ttf', 'NotoSansGeorgian', 'normal');
            }
            return;
        }
        const urls = [
            'fonts/NotoSansGeorgian-Regular.ttf',
            'https://raw.githubusercontent.com/notofonts/noto-fonts/master/unhinted/ttf/NotoSansGeorgian/NotoSansGeorgian-Regular.ttf'
        ];
        for (const url of urls) {
            try {
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const buf = await resp.arrayBuffer();
                if (buf.byteLength < 1000) continue;
                const bytes = new Uint8Array(buf);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                this._cachedBase64 = base64;
                doc.addFileToVFS('NotoSansGeorgian.ttf', base64);
                doc.addFont('NotoSansGeorgian.ttf', 'NotoSansGeorgian', 'normal');
                this._fontLoaded = true;
                this._georgianAvailable = true;
                console.log('[PDF] ✅ Georgian font loaded from:', url);
                return;
            } catch (e) {
                console.warn('[PDF] Font URL failed:', url, e.message);
            }
        }
        console.warn('[PDF] Georgian font not available');
    },

    /** Check if text contains Georgian characters (U+10A0–U+10FF, U+2D00–U+2D2F) */
    _hasGeorgian(text) {
        return /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/.test(text);
    },

    /** Smart text: uses Georgian font for Georgian text, helvetica for everything else */
    _smartText(doc, text, x, y, opts = {}) {
        const size = opts.size || 10;
        const style = opts.style || 'normal';
        doc.setFontSize(size);
        if (this._georgianAvailable && this._hasGeorgian(String(text))) {
            doc.setFont('NotoSansGeorgian', style);
        } else {
            doc.setFont('helvetica', style);
        }
        doc.text(String(text), x, y);
    },

    /** Generate and download client-facing PDF invoice */
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

        // Load Georgian font (registered alongside helvetica)
        await this._loadGeorgianFont(doc);
        const self = this;

        // === Company Header ===
        doc.setTextColor(50, 50, 50);
        this._smartText(doc, "3dprintshop", 14, 20, { size: 20 });
        doc.setTextColor(120, 120, 120);
        this._smartText(doc, "Zugdidi, Georgia", 14, 27, { size: 10 });
        this._smartText(doc, "+995 558 05 60 20", 14, 32, { size: 10 });

        // === INVOICE label ===
        doc.setTextColor(70, 130, 180);
        this._smartText(doc, "INVOICE", 150, 20, { size: 24 });

        // === Invoice details ===
        doc.setTextColor(80, 80, 80);
        this._smartText(doc, `Invoice #: ${order.id.slice(0, 8).toUpperCase()}`, 14, 42, { size: 10 });

        const todayFormatted = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Tbilisi', day: '2-digit', month: 'short', year: 'numeric' });
        this._smartText(doc, `Date: ${todayFormatted}`, 14, 48, { size: 10 });

        // === Bill To (Client Info) ===
        doc.setTextColor(120, 120, 120);
        this._smartText(doc, "Bill To:", 140, 35, { size: 9 });
        doc.setTextColor(30, 30, 30);
        if (client) {
            this._smartText(doc, client.name || '', 140, 42, { size: 12 });
            doc.setTextColor(80, 80, 80);
            let yOff = 48;
            if (client.email) { this._smartText(doc, client.email, 140, yOff, { size: 9 }); yOff += 5; }
            if (client.phone) { this._smartText(doc, client.phone, 140, yOff, { size: 9 }); yOff += 5; }
        } else {
            this._smartText(doc, 'Walk-in Customer', 140, 42, { size: 12 });
        }

        // === Separator line ===
        doc.setDrawColor(200, 200, 200);
        doc.line(14, 55, 196, 55);

        // === Items Table ===
        const tableBody = (order.models || []).map((m, i) => {
            let stockUsed = '—';
            if (order.stockConsumed) {
                const sc = order.stockConsumed.find(s => s.materialId === m.materialId);
                if (sc) stockUsed = `${sc.consumedKg.toFixed(3)} kg`;
            }
            return [
                i + 1,
                m.name || `Model ${i + 1}`,
                `${materialMap[m.materialId] || '-'}`,
                `${m.weightG || 0}g`,
                `${m.estTimeHrs || 0}h`,
                stockUsed,
                `${(order.totalPrice / (order.models || []).length).toFixed(2)} GEL`
            ];
        });

        doc.autoTable({
            startY: 60,
            head: [['#', 'Item', 'Material', 'Weight', 'Time', 'Stock Used', 'Price']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [70, 130, 180], textColor: 255, fontStyle: 'bold', font: 'helvetica' },
            styles: { fontSize: 10, cellPadding: 4, font: 'helvetica' },
            columnStyles: { 6: { halign: 'right' } },
            // Per-cell font: Georgian for cells with Georgian text, helvetica otherwise
            didParseCell: function (data) {
                if (data.section === 'body' && self._georgianAvailable) {
                    const val = String(data.cell.raw || '');
                    if (self._hasGeorgian(val)) {
                        data.cell.styles.font = 'NotoSansGeorgian';
                    }
                }
            }
        });

        // === Total ===
        const finalY = doc.lastAutoTable.finalY + 15;

        doc.setDrawColor(200, 200, 200);
        doc.line(120, finalY - 5, 196, finalY - 5);

        doc.setTextColor(30, 30, 30);
        this._smartText(doc, `Total: ${order.totalPrice.toFixed(2)} GEL`, 140, finalY + 5, { size: 16 });

        // === Footer ===
        const pageH = doc.internal.pageSize.getHeight();
        doc.setTextColor(160, 160, 160);
        this._smartText(doc, 'Thank you for your business!', 14, pageH - 15, { size: 8 });
        this._smartText(doc, '3dprintshop - Zugdidi, Georgia | +995 558 05 60 20', 14, pageH - 10, { size: 8 });

        // Save
        const d = new Date();
        const geo = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tbilisi' }));
        const pad = n => String(n).padStart(2, '0');
        const dateStr = `${geo.getFullYear()}-${pad(geo.getMonth() + 1)}-${pad(geo.getDate())}`;
        doc.save(`3DPrintInvoice_${order.id.slice(0, 8)}_${dateStr}.pdf`);
        Utils.showToast('Invoice PDF downloaded');
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
