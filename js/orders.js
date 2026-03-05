/**
 * orders.js — Order management & cost calculation engine
 * All monetary values in Georgian Lari (₾ GEL)
 */

const Orders = {
  modelCounter: 0,

  /** Initialize order form: populate dropdowns, set defaults, add first model row */
  async init() {
    const settings = await DB.getSettings();
    Utils.setVal('order-margin', settings.defaultMargin || 100);
    Utils.setVal('order-tax', settings.defaultTax || 18);
    Utils.setVal('order-discount', 0);
    Utils.setVal('order-logistics', 0);
    Utils.setVal('order-edit-id', '');
    Utils.setVal('order-deadline', '');

    await this.populateDropdowns();
    this.modelCounter = 0;
    document.getElementById('order-models').innerHTML = '';
    this.addModelRow();
    this.updateBreakdown();

    // Live recalculation on any input change
    const form = document.querySelector('#section-orders');
    form.addEventListener('input', () => this.updateBreakdown());
    form.addEventListener('change', () => this.updateBreakdown());
  },

  /** Populate client & printer/material dropdowns */
  async populateDropdowns() {
    const clients = await DB.getAll('clients');
    const sel = document.getElementById('order-client');
    sel.innerHTML = clients.map(c =>
      `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`
    ).join('');
  },

  /** Build printer <option> list */
  async printerOptions(selectedId) {
    const printers = await DB.getAll('printers');
    return printers.map(p =>
      `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(p.name)} (${Utils.formatGEL(p.hourlyCost)}/hr)</option>`
    ).join('');
  },

  /** Build material <option> list */
  async materialOptions(selectedId) {
    const materials = await DB.getAll('materials');
    return materials.map(m =>
      `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''} data-color="${m.colorHex || '#ccc'}">${Utils.escapeHtml(m.type)} — ${Utils.escapeHtml(m.color || '?')} (${Utils.formatGEL(m.pricePerKg)}/kg)</option>`
    ).join('');
  },

  /** Add a model row to the order form */
  async addModelRow(data) {
    this.modelCounter++;
    const idx = this.modelCounter;
    const printerOpts = await this.printerOptions(data?.printerId);
    const materialOpts = await this.materialOptions(data?.materialId);

    const html = `
      <div class="model-row" id="model-row-${idx}">
        <div class="model-header">
          <span class="model-number">Model #${idx}</span>
          <button class="btn btn-sm btn-outline-danger" onclick="Orders.removeModelRow(${idx})" title="Remove model"><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label form-label-sm">Model Name</label>
            <input type="text" class="form-control form-control-sm model-name" value="${Utils.escapeHtml(data?.name || '')}" placeholder="e.g. Phone Stand">
          </div>
          <div class="col-md-4">
            <label class="form-label form-label-sm">Weight (g)</label>
            <input type="number" class="form-control form-control-sm model-weight" value="${data?.weightG || 100}" min="0" step="1">
          </div>
          <div class="col-md-4">
            <label class="form-label form-label-sm">Est. Time (hrs)</label>
            <input type="number" class="form-control form-control-sm model-time" value="${data?.estTimeHrs || 2}" min="0" step="0.5">
          </div>
          <div class="col-md-6">
            <label class="form-label form-label-sm">Printer</label>
            <select class="form-select form-select-sm model-printer">${printerOpts}</select>
          </div>
          <div class="col-md-6">
            <label class="form-label form-label-sm">Material</label>
            <select class="form-select form-select-sm model-material">${materialOpts}</select>
          </div>
          <div class="col-12">
            <label class="form-label form-label-sm">Extras (₾)</label>
            <div class="extras-container">
              ${(data?.extras || []).map((e, ei) => `
                <div class="input-group input-group-sm mb-1 extra-row">
                  <input type="text" class="form-control extra-label" value="${Utils.escapeHtml(e.label)}" placeholder="Label">
                  <input type="number" class="form-control extra-cost" value="${e.cost}" min="0" step="1" placeholder="₾">
                  <button class="btn btn-outline-danger" onclick="this.closest('.extra-row').remove(); Orders.updateBreakdown();">&times;</button>
                </div>
              `).join('')}
            </div>
            <button class="btn btn-outline-secondary btn-sm mt-1" onclick="Orders.addExtra(${idx})"><i class="bi bi-plus-sm"></i> Extra</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('order-models').insertAdjacentHTML('beforeend', html);
    this.updateBreakdown();
  },

  /** Add an extra cost row to a model */
  addExtra(modelIdx) {
    const container = document.querySelector(`#model-row-${modelIdx} .extras-container`);
    container.insertAdjacentHTML('beforeend', `
      <div class="input-group input-group-sm mb-1 extra-row">
        <input type="text" class="form-control extra-label" placeholder="Label">
        <input type="number" class="form-control extra-cost" value="0" min="0" step="1" placeholder="₾">
        <button class="btn btn-outline-danger" onclick="this.closest('.extra-row').remove(); Orders.updateBreakdown();">&times;</button>
      </div>
    `);
  },

  /** Remove a model row */
  removeModelRow(idx) {
    document.getElementById(`model-row-${idx}`)?.remove();
    this.updateBreakdown();
  },

  /** Collect all model data from the form */
  collectModels() {
    const rows = document.querySelectorAll('.model-row');
    return Array.from(rows).map(row => {
      const extras = Array.from(row.querySelectorAll('.extra-row')).map(er => ({
        label: er.querySelector('.extra-label').value,
        cost: Utils.parseNum(er.querySelector('.extra-cost').value)
      }));
      return {
        name: row.querySelector('.model-name').value,
        weightG: Utils.parseNum(row.querySelector('.model-weight').value),
        estTimeHrs: Utils.parseNum(row.querySelector('.model-time').value),
        printerId: row.querySelector('.model-printer').value,
        materialId: row.querySelector('.model-material').value,
        extras
      };
    });
  },

  /**
   * Calculate costs for all models and order totals
   * Returns { models: [{...costs}], orderSubtotal, overheadsCost, margin, tax, discount, logistics, orderTotal, profit }
   */
  async calculate(models) {
    const settings = await DB.getSettings();
    const overheadTotal = await Overheads.getTotalMonthly();
    const overheadPerHr = (settings.workingHoursPerMonth || 160) > 0
      ? overheadTotal / (settings.workingHoursPerMonth || 160)
      : 0;

    const marginPct = Utils.parseNum(Utils.getVal('order-margin'));
    const taxPct = Utils.parseNum(Utils.getVal('order-tax'));
    const discountPct = Utils.parseNum(Utils.getVal('order-discount'));
    const logisticsCost = Utils.parseNum(Utils.getVal('order-logistics'));

    let totalPrintTime = 0;
    const calculatedModels = [];

    for (const m of models) {
      const printer = await DB.get('printers', m.printerId);
      const material = await DB.get('materials', m.materialId);
      if (!printer || !material) continue;

      const materialCost = (m.weightG / 1000) * material.pricePerKg;
      const printTimeCost = m.estTimeHrs * printer.hourlyCost;
      const electricityCost = (printer.powerW / 1000) * m.estTimeHrs * settings.electricityPerKwh;
      const maintenanceCost = m.estTimeHrs * printer.maintenanceCostPerHr;
      const extrasCost = m.extras.reduce((s, e) => s + e.cost, 0);
      const subtotal = materialCost + printTimeCost + electricityCost + maintenanceCost + extrasCost;

      totalPrintTime += m.estTimeHrs;
      calculatedModels.push({
        ...m,
        printerName: printer.name,
        materialType: material.type,
        materialCost,
        printTimeCost,
        electricityCost,
        maintenanceCost,
        extrasCost,
        subtotal,
        // Formulas for tooltips
        formulas: {
          material: `(${m.weightG}g / 1000) × ${Utils.formatGEL(material.pricePerKg)}/kg`,
          printTime: `${m.estTimeHrs}h × ${Utils.formatGEL(printer.hourlyCost)}/hr`,
          electricity: `(${printer.powerW}W / 1000) × ${m.estTimeHrs}h × ${Utils.formatGEL(settings.electricityPerKwh)}/kWh`,
          maintenance: `${m.estTimeHrs}h × ${Utils.formatGEL(printer.maintenanceCostPerHr)}/hr`,
        }
      });
    }

    const modelsSubtotal = calculatedModels.reduce((s, m) => s + m.subtotal, 0);
    const overheadsCost = overheadPerHr * totalPrintTime;
    const orderSubtotal = modelsSubtotal + logisticsCost + overheadsCost;
    const margin = orderSubtotal * (marginPct / 100);
    const subtotalWithMargin = orderSubtotal + margin;
    const tax = subtotalWithMargin * (taxPct / 100);
    const discount = subtotalWithMargin * (discountPct / 100);
    const orderTotal = subtotalWithMargin + tax - discount;
    const profit = margin - discount;

    return {
      models: calculatedModels,
      modelsSubtotal,
      overheadsCost,
      overheadPerHr,
      totalPrintTime,
      logisticsCost,
      orderSubtotal,
      marginPct, margin,
      taxPct, tax,
      discountPct, discount,
      orderTotal,
      profit,
      formulas: {
        overheads: `${Utils.formatGEL(overheadPerHr)}/hr × ${totalPrintTime.toFixed(1)}h`,
        margin: `${Utils.formatGEL(orderSubtotal)} × ${marginPct}%`,
        tax: `${Utils.formatGEL(subtotalWithMargin)} × ${taxPct}%`,
        discount: `${Utils.formatGEL(subtotalWithMargin)} × ${discountPct}%`,
      }
    };
  },

  /** Update the live breakdown panel */
  async updateBreakdown() {
    const models = this.collectModels();
    const panel = document.getElementById('order-breakdown');
    if (!models.length) {
      panel.innerHTML = '<div class="empty-state"><i class="bi bi-calculator"></i><p>Add a model to see breakdown</p></div>';
      return;
    }

    const calc = await this.calculate(models);

    let html = '';
    // Per-model breakdown
    calc.models.forEach((m, i) => {
      html += `
        <h6 class="fw-bold mt-2 mb-1" style="font-size:0.85rem">${Utils.escapeHtml(m.name || `Model ${i + 1}`)}</h6>
        <div class="breakdown-line"><span class="label formula-tip" title="${m.formulas.material}"><i class="bi bi-box-seam text-primary me-1"></i>Material (${m.materialType})</span><span class="value">${Utils.formatGEL(m.materialCost)}</span></div>
        <div class="breakdown-line"><span class="label formula-tip" title="${m.formulas.printTime}"><i class="bi bi-clock text-info me-1"></i>Print Time</span><span class="value">${Utils.formatGEL(m.printTimeCost)}</span></div>
        <div class="breakdown-line"><span class="label formula-tip" title="${m.formulas.electricity}"><i class="bi bi-lightning text-warning me-1"></i>Electricity</span><span class="value">${Utils.formatGEL(m.electricityCost)}</span></div>
        <div class="breakdown-line"><span class="label formula-tip" title="${m.formulas.maintenance}"><i class="bi bi-wrench text-secondary me-1"></i>Maintenance</span><span class="value">${Utils.formatGEL(m.maintenanceCost)}</span></div>
        ${m.extrasCost > 0 ? `<div class="breakdown-line"><span class="label"><i class="bi bi-plus-circle text-success me-1"></i>Extras</span><span class="value">${Utils.formatGEL(m.extrasCost)}</span></div>` : ''}
        <div class="breakdown-line fw-bold"><span class="label">Subtotal</span><span class="value">${Utils.formatGEL(m.subtotal)}</span></div>
        <div class="breakdown-divider"></div>
      `;
    });

    // Order totals
    html += `
      <div class="breakdown-line"><span class="label">Models Subtotal</span><span class="value">${Utils.formatGEL(calc.modelsSubtotal)}</span></div>
      <div class="breakdown-line"><span class="label formula-tip" title="${calc.formulas.overheads}"><i class="bi bi-building me-1"></i>Overheads</span><span class="value">${Utils.formatGEL(calc.overheadsCost)}</span></div>
      <div class="breakdown-line"><span class="label"><i class="bi bi-truck me-1"></i>Logistics</span><span class="value">${Utils.formatGEL(calc.logisticsCost)}</span></div>
      <div class="breakdown-divider"></div>
      <div class="breakdown-line fw-bold"><span class="label">Cost Subtotal</span><span class="value">${Utils.formatGEL(calc.orderSubtotal)}</span></div>
      <div class="breakdown-line text-success"><span class="label formula-tip" title="${calc.formulas.margin}"><i class="bi bi-graph-up me-1"></i>Margin (${calc.marginPct}%)</span><span class="value">+${Utils.formatGEL(calc.margin)}</span></div>
      <div class="breakdown-line"><span class="label formula-tip" title="${calc.formulas.tax}"><i class="bi bi-receipt me-1"></i>Tax (${calc.taxPct}%)</span><span class="value">+${Utils.formatGEL(calc.tax)}</span></div>
      ${calc.discount > 0 ? `<div class="breakdown-line text-danger"><span class="label formula-tip" title="${calc.formulas.discount}"><i class="bi bi-tag me-1"></i>Discount (${calc.discountPct}%)</span><span class="value">-${Utils.formatGEL(calc.discount)}</span></div>` : ''}
      <div class="breakdown-divider"></div>
      <div class="breakdown-line breakdown-total"><span class="label"><i class="bi bi-cash-stack me-1"></i>Total</span><span class="value">${Utils.formatGEL(calc.orderTotal)}</span></div>
      <div class="breakdown-line text-success"><span class="label"><i class="bi bi-piggy-bank me-1"></i>Profit</span><span class="value">${Utils.formatGEL(calc.profit)}</span></div>
    `;

    panel.innerHTML = html;

    // Enable Bootstrap tooltips
    panel.querySelectorAll('.formula-tip').forEach(el => {
      new bootstrap.Tooltip(el, { placement: 'left', trigger: 'hover' });
    });
  },

  /**
   * Validate and deduct stock for every model in an order.
   * Throws an error string if any material has insufficient stock.
   */
  async deductStockFromOrder(order) {
    const stockConsumed = [];
    // First pass: validate all materials have enough stock
    for (const m of order.models) {
      const material = await DB.get('materials', m.materialId);
      if (!material) continue;
      const weightKg = parseFloat((m.weightG / 1000).toFixed(3));
      const currentStock = parseFloat(material.stockKg) || 0;
      if (currentStock < weightKg) {
        throw `Not enough stock! Only ${currentStock.toFixed(3)} kg left of ${material.type}. Need ${weightKg.toFixed(3)} kg. Order cannot be saved.`;
      }
    }
    // Second pass: deduct and collect consumed info
    for (const m of order.models) {
      const material = await DB.get('materials', m.materialId);
      if (!material) continue;
      const weightKg = parseFloat((m.weightG / 1000).toFixed(3));
      material.stockKg = parseFloat((material.stockKg - weightKg).toFixed(3));
      await DB.put('materials', material);
      stockConsumed.push({ materialId: m.materialId, materialType: material.type, consumedKg: weightKg });
    }
    return stockConsumed;
  },

  /**
   * Restore stock from a previously saved order (used when editing).
   * Adds back the consumed amounts to each material.
   */
  async restoreStockFromOrder(order) {
    if (!order.stockConsumed || !order.stockConsumed.length) {
      // Fallback: restore from model weights if stockConsumed wasn't stored
      for (const m of (order.models || [])) {
        const material = await DB.get('materials', m.materialId);
        if (!material) continue;
        const weightKg = parseFloat((m.weightG / 1000).toFixed(3));
        material.stockKg = parseFloat(((parseFloat(material.stockKg) || 0) + weightKg).toFixed(3));
        await DB.put('materials', material);
      }
      return;
    }
    for (const sc of order.stockConsumed) {
      const material = await DB.get('materials', sc.materialId);
      if (!material) continue;
      material.stockKg = parseFloat(((parseFloat(material.stockKg) || 0) + sc.consumedKg).toFixed(3));
      await DB.put('materials', material);
    }
  },

  /** Save the order to IndexedDB */
  async saveOrder() {
    const models = this.collectModels();
    if (!models.length) {
      Utils.showToast('Add at least one model', 'error');
      return;
    }

    // Validation: Client required
    const clientId = Utils.getVal('order-client');
    if (!clientId) {
      Utils.showToast('Please select a client', 'error');
      document.getElementById('order-client').focus();
      return;
    }

    // Validation: Models must have weight and time
    const invalidModel = models.find(m => m.weightG <= 0 || m.estTimeHrs <= 0);
    if (invalidModel) {
      Utils.showToast(`Model "${invalidModel.name}" has 0 weight or time`, 'error');
      return;
    }

    const calc = await this.calculate(models);
    const editId = Utils.getVal('order-edit-id');

    // If editing, restore previous stock first
    if (editId) {
      const existingOrder = await DB.get('orders', editId);
      if (existingOrder) {
        await this.restoreStockFromOrder(existingOrder);
      }
    }

    // Build order object (without stockConsumed yet)
    const order = {
      id: editId || Utils.generateId(),
      clientId: Utils.getVal('order-client'),
      date: editId ? (await DB.get('orders', editId))?.date || new Date().toISOString() : new Date().toISOString(),
      deadline: Utils.getVal('order-deadline'),
      status: editId ? (await DB.get('orders', editId))?.status || 'pending' : 'pending',
      marginPct: calc.marginPct,
      taxPct: calc.taxPct,
      discountPct: calc.discountPct,
      logisticsCost: calc.logisticsCost,
      models: models,
      totalCost: calc.orderSubtotal,
      totalPrice: calc.orderTotal,
      profit: calc.profit
    };

    // Validate and deduct stock
    try {
      order.stockConsumed = await this.deductStockFromOrder(order);
    } catch (err) {
      // Stock insufficient — re-deduct the restored stock if we were editing
      if (editId) {
        const existingOrder = await DB.get('orders', editId);
        if (existingOrder) await this.deductStockFromOrder(existingOrder).catch(() => { });
      }
      Utils.showToast(String(err), 'error');
      return;
    }

    await DB.put('orders', order);
    Utils.showToast(`Order saved — Total: ${Utils.formatGEL(order.totalPrice)}`);

    // Refresh Materials table to show updated stock levels
    if (typeof Materials !== 'undefined' && Materials.render) {
      Materials.render();
    }

    this.resetForm();
  },

  /** Reset the order form */
  async resetForm() {
    Utils.setVal('order-edit-id', '');
    const settings = await DB.getSettings();
    Utils.setVal('order-margin', settings.defaultMargin || 100);
    Utils.setVal('order-tax', settings.defaultTax || 18);
    Utils.setVal('order-discount', 0);
    Utils.setVal('order-logistics', 0);
    Utils.setVal('order-deadline', '');
    this.modelCounter = 0;
    document.getElementById('order-models').innerHTML = '';
    this.addModelRow();
  },

  /** Load an existing order into the form for editing */
  async loadOrder(orderId) {
    const order = await DB.get('orders', orderId);
    if (!order) return;

    // Switch to orders section
    App.showSection('orders');

    Utils.setVal('order-edit-id', order.id);
    Utils.setVal('order-client', order.clientId);
    Utils.setVal('order-deadline', order.deadline || '');
    Utils.setVal('order-margin', order.marginPct);
    Utils.setVal('order-tax', order.taxPct);
    Utils.setVal('order-discount', order.discountPct);
    Utils.setVal('order-logistics', order.logisticsCost);

    this.modelCounter = 0;
    document.getElementById('order-models').innerHTML = '';
    for (const m of order.models) {
      await this.addModelRow(m);
    }
    this.updateBreakdown();
  }
};
