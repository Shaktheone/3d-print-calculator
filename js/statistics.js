/**
 * statistics.js — Chart.js dashboards for 3D Print Cost Calculator
 * Revenue and costs displayed in Georgian Lari (₾)
 */

const Statistics = {
    charts: {},

    /** Initialize / refresh all charts */
    async render() {
        const orders = await DB.getAll('orders');
        const printers = await DB.getAll('printers');
        const materials = await DB.getAll('materials');
        const clients = await DB.getAll('clients');

        // Detect dark mode for chart text/grid colors
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        this._textColor = isDark ? '#c8c8d0' : '#333';
        this._gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

        this.renderMaterialCosts(orders, materials);
        this.renderRevenueOverTime(orders);
        this.renderTopPrinters(orders, printers);
        this.renderTopClients(orders, clients);
    },

    /** Destroy existing chart before re-creating */
    _destroy(key) {
        if (this.charts[key]) {
            this.charts[key].destroy();
            this.charts[key] = null;
        }
    },

    /** Common chart colors (vibrant, work on dark & light) */
    _colors: [
        '#7c3aed', '#059669', '#2563eb', '#d97706', '#db2777',
        '#0891b2', '#65a30d', '#dc2626', '#7c2d12', '#4338ca'
    ],

    /** Show "No data" message on a canvas */
    _showEmpty(canvasId, message) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const parent = canvas.parentElement;
        // Remove any previous empty message
        const prev = parent.querySelector('.chart-empty');
        if (prev) prev.remove();
        // Hide canvas, show message
        canvas.style.display = 'none';
        const div = document.createElement('div');
        div.className = 'chart-empty text-center text-muted py-5';
        div.innerHTML = `<i class="bi bi-bar-chart fs-1 d-block mb-2 opacity-50"></i>${message}`;
        parent.appendChild(div);
    },

    /** Show canvas and remove any empty message */
    _showCanvas(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        canvas.style.display = '';
        const prev = canvas.parentElement.querySelector('.chart-empty');
        if (prev) prev.remove();
    },

    /** Common scale options for axes */
    _scaleOpts() {
        return {
            ticks: { color: this._textColor },
            grid: { color: this._gridColor }
        };
    },

    /** 1. Costs by Material */
    renderMaterialCosts(orders, materials) {
        this._destroy('materials');
        const canvasId = 'chart-materials';

        if (!materials.length) {
            this._showEmpty(canvasId, 'No materials yet');
            return;
        }

        this._showCanvas(canvasId);
        const matMap = {};
        materials.forEach(m => matMap[m.id] = { type: m.type, cost: 0 });
        orders.forEach(o => {
            (o.models || []).forEach(m => {
                if (matMap[m.materialId]) {
                    const material = materials.find(mt => mt.id === m.materialId);
                    if (material) {
                        matMap[m.materialId].cost += (m.weightG / 1000) * material.pricePerKg;
                    }
                }
            });
        });

        const labels = Object.values(matMap).map(m => m.type);
        const data = Object.values(matMap).map(m => parseFloat(m.cost.toFixed(2)));

        this.charts.materials = new Chart(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Material Cost ₾',
                    data,
                    backgroundColor: this._colors.slice(0, labels.length),
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} ₾` } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { ...this._scaleOpts().ticks, callback: v => v + ' ₾' }, grid: this._scaleOpts().grid },
                    x: this._scaleOpts()
                }
            }
        });
    },

    /** 2. Revenue over time (monthly) */
    renderRevenueOverTime(orders) {
        this._destroy('revenue');
        const canvasId = 'chart-revenue';

        if (!orders.length) {
            this._showEmpty(canvasId, 'No orders yet');
            return;
        }

        this._showCanvas(canvasId);
        const monthly = {};
        orders.forEach(o => {
            if (!o.date) return;
            const key = o.date.slice(0, 7); // YYYY-MM
            monthly[key] = (monthly[key] || 0) + (o.totalPrice || 0);
        });

        const sortedKeys = Object.keys(monthly).sort();
        const labels = sortedKeys.map(k => {
            const [y, m] = k.split('-');
            return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m) - 1]} ${y}`;
        });
        const data = sortedKeys.map(k => parseFloat(monthly[k].toFixed(2)));

        this.charts.revenue = new Chart(document.getElementById(canvasId), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Revenue ₾',
                    data,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.15)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#059669',
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: this._textColor } },
                    tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} ₾` } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { ...this._scaleOpts().ticks, callback: v => v + ' ₾' }, grid: this._scaleOpts().grid },
                    x: this._scaleOpts()
                }
            }
        });
    },

    /** 3. Top printers by number of models printed */
    renderTopPrinters(orders, printers) {
        this._destroy('printers');
        const canvasId = 'chart-printers';

        if (!printers.length) {
            this._showEmpty(canvasId, 'No printers yet');
            return;
        }

        this._showCanvas(canvasId);
        const usage = {};
        printers.forEach(p => usage[p.id] = { name: p.name, count: 0 });
        orders.forEach(o => {
            (o.models || []).forEach(m => {
                if (usage[m.printerId]) usage[m.printerId].count++;
            });
        });

        const sorted = Object.values(usage).sort((a, b) => b.count - a.count).slice(0, 6);

        this.charts.printers = new Chart(document.getElementById(canvasId), {
            type: 'doughnut',
            data: {
                labels: sorted.map(p => p.name),
                datasets: [{
                    data: sorted.map(p => p.count),
                    backgroundColor: this._colors.slice(0, sorted.length),
                    borderWidth: 2,
                    borderColor: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#1e1e2e' : '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: this._textColor, padding: 12 }
                    },
                    tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} models` } }
                }
            }
        });
    },

    /** 4. Top clients by revenue */
    renderTopClients(orders, clients) {
        this._destroy('clients');
        const canvasId = 'chart-clients';

        if (!clients.length) {
            this._showEmpty(canvasId, 'No clients yet');
            return;
        }

        this._showCanvas(canvasId);
        const rev = {};
        clients.forEach(c => rev[c.id] = { name: c.name, total: 0 });
        orders.forEach(o => {
            if (rev[o.clientId]) rev[o.clientId].total += (o.totalPrice || 0);
        });

        const sorted = Object.values(rev).sort((a, b) => b.total - a.total).slice(0, 6);

        this.charts.clients = new Chart(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels: sorted.map(c => c.name),
                datasets: [{
                    label: 'Revenue ₾',
                    data: sorted.map(c => parseFloat(c.total.toFixed(2))),
                    backgroundColor: this._colors.slice(0, sorted.length),
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(2)} ₾` } }
                },
                scales: {
                    x: { beginAtZero: true, ticks: { ...this._scaleOpts().ticks, callback: v => v + ' ₾' }, grid: this._scaleOpts().grid },
                    y: this._scaleOpts()
                }
            }
        });
    }
};
