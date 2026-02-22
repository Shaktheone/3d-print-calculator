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

    /** Export financials as multi-sheet XLSX */
    async exportXLSX() {
        try {
            if (typeof XLSX === 'undefined') {
                throw new Error('SheetJS library not loaded');
            }

            const orders = await DB.getAll('orders');
            const clients = await DB.getAll('clients');
            const clientMap = {};
            clients.forEach(c => clientMap[c.id] = c.name);

            const printers = await DB.getAll('printers');
            const materials = await DB.getAll('materials');
            const printerMap = {};
            const printerData = {};
            printers.forEach(p => { printerMap[p.id] = p.name; printerData[p.id] = p; });
            const materialMap = {};
            const materialData = {};
            materials.forEach(m => { materialMap[m.id] = m.type; materialData[m.id] = m; });

            const settings = await DB.getSettings();
            const overheadTotal = await Overheads.getTotalMonthly();
            const overheadPerHr = (settings.workingHoursPerMonth || 160) > 0
                ? overheadTotal / (settings.workingHoursPerMonth || 160) : 0;

            // Sheet 1: Orders Data
            const wsOrdersData = [
                ['Order ID', 'Date', 'Month-Year', 'Client', 'Status', 'Margin % (Input)', 'Tax %', 'Discount %', 'Logistics ₾', 'Model', 'Weight g', 'Time hrs', 'Printer', 'Material', 'Cost/Gram ₾', 'Total Cost ₾', 'Total Price ₾', 'Profit ₾', 'Margin % (Real)', 'ROI %', 'Filament ₾', 'Electricity ₾', 'Maintenance ₾', 'Overheads ₾']
            ];

            let sumRevenue = 0, sumCost = 0, sumProfit = 0, sumWeight = 0;
            let sumFilament = 0, sumElectricity = 0, sumMaintenance = 0, sumOverheads = 0;

            const monthlyData = {};
            const printerStats = {};
            const materialStats = {};
            const clientStats = {};

            orders.forEach(o => {
                const clientName = clientMap[o.clientId] || 'Walk-in Customer';
                const dateObj = o.date ? new Date(o.date) : new Date();
                const monthYear = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

                sumRevenue += o.totalPrice || 0;
                sumCost += o.totalCost || 0;
                sumProfit += o.profit || 0;

                let rowFilament = 0, rowElectricity = 0, rowMaintenance = 0, rowOverheads = 0, rowWeight = 0;

                let orderPrintTime = 0;
                (o.models || []).forEach(m => {
                    orderPrintTime += m.estTimeHrs || 0;
                    rowWeight += m.weightG || 0;
                });

                rowOverheads = overheadPerHr * orderPrintTime;
                sumOverheads += rowOverheads;
                sumWeight += rowWeight;

                // Aggregations
                if (!monthlyData[monthYear]) monthlyData[monthYear] = { revenue: 0, cost: 0, profit: 0 };
                monthlyData[monthYear].revenue += o.totalPrice || 0;
                monthlyData[monthYear].cost += o.totalCost || 0;
                monthlyData[monthYear].profit += o.profit || 0;

                if (!clientStats[clientName]) clientStats[clientName] = { revenue: 0, profit: 0 };
                clientStats[clientName].revenue += o.totalPrice || 0;
                clientStats[clientName].profit += o.profit || 0;

                (o.models || [{ name: 'Empty Order' }]).forEach(m => {
                    const mat = materialData[m.materialId];
                    const pr = printerData[m.printerId];
                    let mFilament = 0, mElec = 0, mMaint = 0;

                    if (mat) {
                        mFilament = (m.weightG / 1000) * mat.pricePerKg;
                        sumFilament += mFilament;
                        rowFilament += mFilament;

                        const matName = mat.type;
                        if (!materialStats[matName]) materialStats[matName] = { revenue: 0, profit: 0 };
                        // Rough attribution of revenue/profit to partial model
                        const ratio = (o.models.length > 0) ? (1 / o.models.length) : 1;
                        materialStats[matName].revenue += (o.totalPrice || 0) * ratio;
                        materialStats[matName].profit += (o.profit || 0) * ratio;
                    }
                    if (pr) {
                        mElec = (pr.powerW / 1000) * m.estTimeHrs * settings.electricityPerKwh;
                        mMaint = m.estTimeHrs * pr.maintenanceCostPerHr;
                        sumElectricity += mElec;
                        sumMaintenance += mMaint;
                        rowElectricity += mElec;
                        rowMaintenance += mMaint;

                        const prName = pr.name;
                        if (!printerStats[prName]) printerStats[prName] = { revenue: 0, profit: 0 };
                        const ratio = (o.models.length > 0) ? (1 / o.models.length) : 1;
                        printerStats[prName].revenue += (o.totalPrice || 0) * ratio;
                        printerStats[prName].profit += (o.profit || 0) * ratio;
                    }

                    const costPerGram = m.weightG > 0 ? ((o.totalCost || 0) / o.models.length) / m.weightG : 0;
                    const realMargin = o.totalPrice > 0 ? (o.profit / o.totalPrice) : 0;
                    const roi = o.totalCost > 0 ? (o.profit / o.totalCost) : 0;

                    wsOrdersData.push([
                        o.id.slice(0, 8),
                        o.date ? o.date.slice(0, 10) : '',
                        monthYear,
                        clientName,
                        o.status,
                        (o.marginPct || 0) / 100, // Excel % format matches decimal
                        (o.taxPct || 0) / 100,
                        (o.discountPct || 0) / 100,
                        o.logisticsCost || 0,
                        m.name || '',
                        m.weightG || 0,
                        m.estTimeHrs || 0,
                        printerMap[m.printerId] || '',
                        materialMap[m.materialId] || '',
                        costPerGram,
                        (o.totalCost || 0) / Math.max(1, o.models.length),
                        (o.totalPrice || 0) / Math.max(1, o.models.length),
                        (o.profit || 0) / Math.max(1, o.models.length),
                        realMargin,
                        roi,
                        mFilament,
                        mElec,
                        mMaint,
                        rowOverheads / Math.max(1, o.models.length)
                    ]);
                });
            });

            // Sheet 2: Summaries
            const avgMargin = sumRevenue > 0 ? (sumProfit / sumRevenue) : 0;
            const avgCostPerGram = sumWeight > 0 ? (sumCost / sumWeight) : 0;

            const wsSummariesData = [
                ['--- OVERALL SUMMARY ---'],
                ['Metric', 'Value'],
                ['Total Revenue ₾', sumRevenue],
                ['Total Cost ₾', sumCost],
                ['Total Profit ₾', sumProfit],
                ['Average Margin %', avgMargin],
                ['Average Cost/Gram ₾', avgCostPerGram],
                [''],
                ['--- BY CLIENT ---'],
                ['Client Name', 'Revenue ₾', 'Profit ₾']
            ];
            Object.entries(clientStats).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([k, v]) => {
                wsSummariesData.push([k, v.revenue, v.profit]);
            });

            // Sheet 3: Expenses Breakdown
            const wsExpensesData = [
                ['Expense Category', 'Amount ₾', '% of Total Cost'],
                ['Filament', sumFilament, sumCost > 0 ? sumFilament / sumCost : 0],
                ['Electricity', sumElectricity, sumCost > 0 ? sumElectricity / sumCost : 0],
                ['Maintenance', sumMaintenance, sumCost > 0 ? sumMaintenance / sumCost : 0],
                ['Overheads', sumOverheads, sumCost > 0 ? sumOverheads / sumCost : 0],
                ['TOTAL COST', sumCost, 1]
            ];

            // Sheet 4: Trends
            const wsTrendsData = [
                ['--- MONTHLY TRENDS ---'],
                ['Month-Year', 'Revenue ₾', 'Cost ₾', 'Profit ₾']
            ];
            Object.keys(monthlyData).sort().forEach(m => {
                wsTrendsData.push([m, monthlyData[m].revenue, monthlyData[m].cost, monthlyData[m].profit]);
            });

            wsTrendsData.push(['']);
            wsTrendsData.push(['--- TOP PRINTERS ---']);
            wsTrendsData.push(['Printer', 'Revenue ₾', 'Profit ₾']);
            Object.entries(printerStats).sort((a, b) => b[1].profit - a[1].profit).forEach(([k, v]) => {
                wsTrendsData.push([k, v.revenue, v.profit]);
            });

            wsTrendsData.push(['']);
            wsTrendsData.push(['--- TOP MATERIALS ---']);
            wsTrendsData.push(['Material', 'Revenue ₾', 'Profit ₾']);
            Object.entries(materialStats).sort((a, b) => b[1].profit - a[1].profit).forEach(([k, v]) => {
                wsTrendsData.push([k, v.revenue, v.profit]);
            });

            // Create Workbook
            const wb = XLSX.utils.book_new();

            const wsOrders = XLSX.utils.aoa_to_sheet(wsOrdersData);
            const wsSummaries = XLSX.utils.aoa_to_sheet(wsSummariesData);
            const wsExpenses = XLSX.utils.aoa_to_sheet(wsExpensesData);
            const wsTrends = XLSX.utils.aoa_to_sheet(wsTrendsData);

            // Add sheets
            XLSX.utils.book_append_sheet(wb, wsOrders, "Orders");
            XLSX.utils.book_append_sheet(wb, wsSummaries, "Summaries");
            XLSX.utils.book_append_sheet(wb, wsExpenses, "Expenses Breakdown");
            XLSX.utils.book_append_sheet(wb, wsTrends, "Trends");

            // Format percentages and currencies
            // XLSX formatting is basic via raw writes; mostly rely on native Excel post-formatting or style objects if paid version. 
            // We structured percentages as decimals so Excel easily converts them if user clicks %.

            const d = new Date();
            const geo = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tbilisi' }));
            const pad = n => String(n).padStart(2, '0');
            const dateStr = `${geo.getFullYear()}-${pad(geo.getMonth() + 1)}-${pad(geo.getDate())}`;

            XLSX.writeFile(wb, `3DPrintFinancials_${dateStr}.xlsx`);
            Utils.showToast('Financials exported as XLSX');
        } catch (e) {
            console.error(e);
            Utils.showToast('XLSX export failed: ' + e.message, 'error');
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
