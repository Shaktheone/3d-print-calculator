/**
 * statistics.js — Advanced Financial Dashboard for 3D Print Cost Calculator
 * Displays deep financial insights, alerts, and interactive charts.
 */

const Statistics = {
    charts: {},
    currentFilter: 'all', // '30', 'month', 'all'

    /** Initialize / refresh dashboard */
    async render() {
        const orders = await DB.getAll('orders');
        const printers = await DB.getAll('printers');
        const materials = await DB.getAll('materials');
        const clients = await DB.getAll('clients');
        const settings = await DB.getSettings();

        // Get filter value from DOM if present
        const filterEl = document.getElementById('stat-date-filter');
        if (filterEl) this.currentFilter = filterEl.value;

        // Detect dark mode for chart text/grid colors
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        this._textColor = isDark ? '#c8c8d0' : '#333';
        this._gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
        this._tooltipBg = isDark ? 'rgba(30,30,46,0.95)' : 'rgba(255,255,255,0.95)';
        this._tooltipText = isDark ? '#fff' : '#111';

        const filteredOrders = this._filterOrders(orders);

        this.renderKPIs(filteredOrders, materials, printers, settings);
        this.renderAlerts(filteredOrders, clients, materials);

        this.renderRevenueVsCost(filteredOrders);
        this.renderCostsAndVolume(filteredOrders, materials);
        this.renderPrinterUtilization(filteredOrders, printers, settings);
        this.renderClientConcentration(filteredOrders, clients);
    },

    applyFilter() {
        this.render();
    },

    /** Filter orders by selected date range */
    _filterOrders(orders) {
        if (this.currentFilter === 'all') return orders;

        const now = new Date();
        const tbilisiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tbilisi' }));

        return orders.filter(o => {
            if (!o.date) return false;
            const oDate = new Date(o.date);

            if (this.currentFilter === '30') {
                const diffTime = Math.abs(tbilisiNow - oDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= 30;
            }
            else if (this.currentFilter === 'month') {
                return oDate.getMonth() === tbilisiNow.getMonth() && oDate.getFullYear() === tbilisiNow.getFullYear();
            }
            return true;
        });
    },

    /** Destroy existing chart before re-creating */
    _destroy(key) {
        if (this.charts[key]) {
            this.charts[key].destroy();
            this.charts[key] = null;
        }
    },

    /** Show "No data" message on a canvas */
    _showEmpty(canvasId, message) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const parent = canvas.parentElement;
        const prev = parent.querySelector('.chart-empty');
        if (prev) prev.remove();
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

    _tooltipOpts() {
        return {
            backgroundColor: this._tooltipBg,
            titleColor: this._tooltipText,
            bodyColor: this._tooltipText,
            borderColor: this._gridColor,
            borderWidth: 1,
            padding: 10,
            boxPadding: 4
        };
    },

    /** 1. Render Top KPI Cards */
    async renderKPIs(orders, materials, printers, settings) {
        let revenue = 0;
        let cost = 0;
        let profit = 0;
        let totalWeight = 0;
        let totalPrintTime = 0;

        orders.forEach(o => {
            revenue += o.totalPrice || 0;
            cost += o.totalCost || 0;
            profit += o.profit || 0;
            (o.models || []).forEach(m => {
                totalWeight += m.weightG || 0;
                totalPrintTime += m.estTimeHrs || 0;
            });
        });

        const grossMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
        const avgOrder = orders.length > 0 ? revenue / orders.length : 0;
        const costPerGram = totalWeight > 0 ? cost / totalWeight : 0;

        // Printer Utilization Approximation
        let maxHours = 0;
        const workingHrs = settings.workingHoursPerMonth || 160;
        if (printers.length > 0) {
            if (this.currentFilter === '30' || this.currentFilter === 'month') {
                maxHours = printers.length * workingHrs;
            } else {
                if (orders.length > 0) {
                    const dates = orders.map(o => new Date(o.date).getTime());
                    const msInMonth = 1000 * 60 * 60 * 24 * 30;
                    const monthsSpanned = Math.max(1, (new Date().getTime() - Math.min(...dates)) / msInMonth);
                    maxHours = printers.length * workingHrs * monthsSpanned;
                }
            }
        }
        const utilization = maxHours > 0 ? (totalPrintTime / maxHours) * 100 : 0;

        const container = document.getElementById('stat-kpi-container');
        if (!container) return;

        container.innerHTML = `
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card stat-card text-center h-100 p-3 border-start border-4 shadow-sm" style="border-color: #059669 !important;">
                    <small class="text-muted d-block mb-1">Gross Margin</small>
                    <h4 class="fw-bold mb-0 text-success">${grossMargin.toFixed(1)}%</h4>
                </div>
            </div>
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card stat-card text-center h-100 p-3 border-start border-4 shadow-sm" style="border-color: #059669 !important;">
                    <small class="text-muted d-block mb-1">Net Profit</small>
                    <h4 class="fw-bold mb-0 text-success">${profit.toFixed(2)} ₾</h4>
                </div>
            </div>
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card stat-card text-center h-100 p-3 border-start border-4 shadow-sm" style="border-color: #2563eb !important;">
                    <small class="text-muted d-block mb-1">Avg Revenue/Order</small>
                    <h4 class="fw-bold mb-0 text-primary">${avgOrder.toFixed(2)} ₾</h4>
                </div>
            </div>
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card stat-card text-center h-100 p-3 border-start border-4 shadow-sm" style="border-color: #d97706 !important;">
                    <small class="text-muted d-block mb-1">Cost per Gram</small>
                    <h4 class="fw-bold mb-0 text-warning">${costPerGram.toFixed(3)} ₾</h4>
                </div>
            </div>
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card stat-card text-center h-100 p-3 border-start border-4 shadow-sm" style="border-color: #7c3aed !important;">
                    <small class="text-muted d-block mb-1">Printer Utilization</small>
                    <h4 class="fw-bold mb-0" style="color: #7c3aed">${utilization.toFixed(1)}%</h4>
                </div>
            </div>
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card stat-card text-center h-100 p-3 border-start border-4 shadow-sm" style="border-color: #db2777 !important;">
                    <small class="text-muted d-block mb-1">Orders in Period</small>
                    <h4 class="fw-bold mb-0" style="color: #db2777">${orders.length}</h4>
                </div>
            </div>
        `;
    },

    /** 2. Render Business Context Alerts */
    renderAlerts(orders, clients, materials) {
        const container = document.getElementById('stat-alerts-container');
        if (!container) return;
        container.innerHTML = '';

        if (orders.length === 0) return;

        let totalRevenue = 0;
        const clientRevs = { 'walk-in': 0 };
        orders.forEach(o => {
            const r = o.totalPrice || 0;
            totalRevenue += r;
            const cId = o.clientId || 'walk-in';
            clientRevs[cId] = (clientRevs[cId] || 0) + r;
        });

        const alerts = [];

        // Single Client dependency alert
        const topClientEntry = Object.entries(clientRevs).sort((a, b) => b[1] - a[1])[0];
        if (topClientEntry && totalRevenue > 0) {
            const pct = (topClientEntry[1] / totalRevenue) * 100;
            if (pct > 40 && topClientEntry[0] !== 'walk-in') {
                const client = clients.find(c => c.id === topClientEntry[0]);
                const name = client ? client.name : 'A single client';
                alerts.push(`
                <div class="alert alert-warning py-2 border-warning text-dark d-flex align-items-center">
                    <i class="bi bi-exclamation-triangle-fill fs-4 me-3 text-warning"></i>
                    <div>
                        <strong>High Client Dependency:</strong> 
                        ${name} accounts for <strong>${pct.toFixed(1)}%</strong> of revenue in this period. Consider diversifying to reduce risk.
                    </div>
                </div>`);
            }
        }

        container.innerHTML = alerts.join('');
    },

    /** 3. Chart: Revenue vs Cost Over Time (Line) */
    renderRevenueVsCost(orders) {
        this._destroy('revenue');
        const canvasId = 'chart-revenue';
        if (!orders.length) return this._showEmpty(canvasId, 'No orders for this period');
        this._showCanvas(canvasId);

        // Group by day if <=31 days, else month
        const isDaily = (this.currentFilter === '30' || this.currentFilter === 'month');

        const timeline = {};
        orders.forEach(o => {
            if (!o.date) return;
            const key = isDaily ? o.date.slice(0, 10) : o.date.slice(0, 7);
            if (!timeline[key]) timeline[key] = { rev: 0, cost: 0, profit: 0 };
            timeline[key].rev += o.totalPrice || 0;
            timeline[key].cost += o.totalCost || 0;
            timeline[key].profit += o.profit || 0;
        });

        const sortedKeys = Object.keys(timeline).sort();
        const labels = sortedKeys.map(k => {
            if (!isDaily) {
                const [y, m] = k.split('-');
                return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m) - 1]} ${y}`;
            }
            return k.slice(5); // MM-DD
        });

        const revData = sortedKeys.map(k => parseFloat(timeline[k].rev.toFixed(2)));
        const costData = sortedKeys.map(k => parseFloat(timeline[k].cost.toFixed(2)));

        this.charts.revenue = new Chart(document.getElementById(canvasId), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Revenue ₾',
                        data: revData,
                        borderColor: '#059669',
                        backgroundColor: 'rgba(5, 150, 105, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#059669',
                        borderWidth: 2
                    },
                    {
                        label: 'Cost ₾',
                        data: costData,
                        borderColor: '#dc2626',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        tension: 0.3,
                        pointBackgroundColor: '#dc2626',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: this._textColor } },
                    tooltip: { ...this._tooltipOpts(), callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ₾` } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { ...this._scaleOpts().ticks, callback: v => v + ' ₾' }, grid: this._scaleOpts().grid },
                    x: this._scaleOpts()
                }
            }
        });
    },

    /** 4. Chart: Costs and Volume by Material (Grouped Bar - dual axis) */
    renderCostsAndVolume(orders, materials) {
        this._destroy('materials');
        const canvasId = 'chart-materials';
        if (!orders.length || !materials.length) return this._showEmpty(canvasId, 'No material data in period');
        this._showCanvas(canvasId);

        const matMap = {};
        materials.forEach(m => matMap[m.id] = { type: m.type, cost: 0, grams: 0, stockKg: parseFloat(m.stockKg) || 0 });

        orders.forEach(o => {
            (o.models || []).forEach(m => {
                if (matMap[m.materialId]) {
                    const matInfo = materials.find(mt => mt.id === m.materialId);
                    if (matInfo) {
                        matMap[m.materialId].cost += (m.weightG / 1000) * matInfo.pricePerKg;
                        matMap[m.materialId].grams += m.weightG || 0;
                    }
                }
            });
        });

        // Filter out zero-use materials
        const usedMats = Object.values(matMap).filter(m => m.grams > 0).sort((a, b) => b.cost - a.cost);
        if (!usedMats.length) return this._showEmpty(canvasId, 'No material usage in period');

        const labels = usedMats.map(m => m.type);
        const costData = usedMats.map(m => parseFloat(m.cost.toFixed(2)));
        const volData = usedMats.map(m => parseFloat(m.grams.toFixed(0)));
        const stockData = usedMats.map(m => parseFloat((m.stockKg * 1000).toFixed(0)));

        this.charts.materials = new Chart(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Material Cost ₾',
                        data: costData,
                        backgroundColor: '#7c3aed',
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Volume Used (g)',
                        data: volData,
                        backgroundColor: 'rgba(124, 58, 237, 0.2)',
                        borderColor: '#7c3aed',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Remaining Stock (g)',
                        data: stockData,
                        backgroundColor: 'rgba(5, 150, 105, 0.35)',
                        borderColor: '#059669',
                        borderWidth: 1,
                        borderRadius: 4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: this._textColor }, position: 'top' },
                    tooltip: this._tooltipOpts()
                },
                scales: {
                    x: this._scaleOpts(),
                    y: {
                        type: 'linear', display: true, position: 'left',
                        ticks: { color: '#7c3aed', callback: v => v + ' ₾' }, grid: this._scaleOpts().grid
                    },
                    y1: {
                        type: 'linear', display: true, position: 'right',
                        ticks: { color: this._textColor, callback: v => v + 'g' }, grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    },

    /** 5. Chart: Top Printers by Utilization % (Horizontal Bar) */
    renderPrinterUtilization(orders, printers, settings) {
        this._destroy('printers');
        const canvasId = 'chart-printers';
        if (!orders.length || !printers.length) return this._showEmpty(canvasId, 'No printer usage');
        this._showCanvas(canvasId);

        const usage = {};
        printers.forEach(p => usage[p.id] = { name: p.name, hrs: 0 });

        orders.forEach(o => {
            (o.models || []).forEach(m => {
                if (usage[m.printerId]) usage[m.printerId].hrs += (m.estTimeHrs || 0);
            });
        });

        // Calculate max hours per printer in period
        const workingHrs = settings.workingHoursPerMonth || 160;
        let monthsSpanned = 1;
        if (this.currentFilter === 'all' && orders.length > 0) {
            const dates = orders.map(o => new Date(o.date).getTime());
            const msInMonth = 1000 * 60 * 60 * 24 * 30;
            monthsSpanned = Math.max(1, (new Date().getTime() - Math.min(...dates)) / msInMonth);
        }
        const maxHours = workingHrs * monthsSpanned;

        const sorted = Object.values(usage).filter(p => p.hrs > 0).sort((a, b) => b.hrs - a.hrs).slice(0, 8);
        if (!sorted.length) return this._showEmpty(canvasId, 'No printer usage in period');

        const labels = sorted.map(p => p.name);
        const data = sorted.map(p => parseFloat(((p.hrs / maxHours) * 100).toFixed(1)));

        this.charts.printers = new Chart(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Utilization %',
                    data,
                    backgroundColor: '#2563eb',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { ...this._tooltipOpts(), callbacks: { label: ctx => `${ctx.parsed.x.toFixed(1)}% (${sorted[ctx.dataIndex].hrs.toFixed(1)} hrs)` } }
                },
                scales: {
                    x: { ticks: { ...this._scaleOpts().ticks, callback: v => v + '%' }, grid: this._scaleOpts().grid },
                    y: this._scaleOpts()
                }
            }
        });
    },

    /** 6. Chart: Client Revenue Concentration (Horizontal Bar) */
    renderClientConcentration(orders, clients) {
        this._destroy('clients');
        const canvasId = 'chart-clients';
        if (!orders.length) return this._showEmpty(canvasId, 'No client data');
        this._showCanvas(canvasId);

        let totalRev = 0;
        const rev = { 'walk-in': { name: 'Walk-in Customer / Unassigned', total: 0 } };
        clients.forEach(c => rev[c.id] = { name: c.name, total: 0 });

        orders.forEach(o => {
            const r = o.totalPrice || 0;
            const cId = o.clientId || 'walk-in';
            if (!rev[cId]) rev[cId] = { name: 'Unknown', total: 0 };
            rev[cId].total += r;
            totalRev += r;
        });

        const sorted = Object.values(rev).filter(c => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
        if (!sorted.length) return this._showEmpty(canvasId, 'No client revenue in period');

        const labels = sorted.map(c => c.name);
        const data = sorted.map(c => parseFloat(c.total.toFixed(2)));

        this.charts.clients = new Chart(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Revenue ₾',
                    data,
                    backgroundColor: '#0891b2',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...this._tooltipOpts(),
                        callbacks: {
                            label: ctx => {
                                const val = ctx.parsed.x;
                                const pct = totalRev > 0 ? ((val / totalRev) * 100).toFixed(1) : 0;
                                return `${val.toFixed(2)} ₾ (${pct}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { ...this._scaleOpts().ticks, callback: v => v + ' ₾' }, grid: this._scaleOpts().grid },
                    y: this._scaleOpts()
                }
            }
        });
    }
};

window.Statistics = Statistics;
