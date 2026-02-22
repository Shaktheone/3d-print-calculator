/**
 * db.js — IndexedDB wrapper for 3D Print Cost Calculator
 * Stores: printers, materials, overheads, clients, orders, settings
 */

const DB = {
    name: 'PrintCalc3D',
    version: 2,
    db: null,
    stores: ['printers', 'materials', 'overheads', 'expenses', 'clients', 'orders', 'settings'],

    /**
     * Open (or create) the database
     */
    open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.name, this.version);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                this.stores.forEach(s => {
                    if (!db.objectStoreNames.contains(s)) {
                        db.createObjectStore(s, { keyPath: 'id' });
                    }
                });
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    /** Get a transaction object store */
    _tx(store, mode = 'readonly') {
        return this.db.transaction(store, mode).objectStore(store);
    },

    /** Get all records from a store */
    getAll(store) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },

    /** Get a single record by ID */
    get(store, id) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    /** Put (insert or update) a record */
    put(store, data) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').put(data);
            req.onsuccess = () => {
                resolve(req.result);
                if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleUpload();
            };
            req.onerror = () => reject(req.error);
        });
    },

    /** Delete a record by ID */
    del(store, id) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').delete(id);
            req.onsuccess = () => {
                resolve();
                if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleUpload();
            };
            req.onerror = () => reject(req.error);
        });
    },

    /** Count records in a store */
    count(store) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store).count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    /** Clear all data from all stores */
    async clearAll() {
        for (const store of this.stores) {
            await new Promise((resolve, reject) => {
                const req = this._tx(store, 'readwrite').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
        if (typeof FirebaseSync !== 'undefined') FirebaseSync.scheduleUpload();
    },

    /** Clear all stores WITHOUT triggering Firebase upload (used during cloud restore) */
    async clearAllSilent() {
        for (const store of this.stores) {
            await new Promise((resolve, reject) => {
                const req = this._tx(store, 'readwrite').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    },

    /** Put a record WITHOUT triggering Firebase upload (used during cloud restore) */
    putSilent(store, data) {
        return new Promise((resolve, reject) => {
            const req = this._tx(store, 'readwrite').put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    /** Export all data as JSON object */
    async exportAll() {
        const data = {};
        for (const store of this.stores) {
            data[store] = await this.getAll(store);
        }
        return data;
    },

    /** Import data from JSON object */
    async importAll(data) {
        for (const store of this.stores) {
            if (data[store] && Array.isArray(data[store])) {
                for (const record of data[store]) {
                    await this.put(store, record);
                }
            }
        }
    },

    /** Import data WITHOUT triggering Firebase upload (used during cloud restore) */
    async importAllSilent(data) {
        for (const store of this.stores) {
            if (data[store] && Array.isArray(data[store])) {
                for (const record of data[store]) {
                    await this.putSilent(store, record);
                }
            }
        }
    },

    /** Get settings (singleton) */
    async getSettings() {
        let settings = await this.get('settings', 'app');
        if (!settings) {
            settings = {
                id: 'app',
                electricityPerKwh: 0.18,
                defaultMargin: 100,
                defaultTax: 18,
                darkMode: false,
                workingHoursPerMonth: 160
            };
            await this.put('settings', settings);
        }
        return settings;
    },

    /**
     * Seed sample data on first load (Georgian defaults)
     */
    async seedIfEmpty() {
        const printerCount = await this.count('printers');
        if (printerCount > 0) return false; // already has data

        // --- Printers (Bambu Lab) ---
        await this.put('printers', {
            id: 'p1', name: 'Bambu Lab P2S',
            hourlyCost: 25, powerW: 350,
            maintenanceCostPerHr: 0.50, speedGPerH: 50,
            profile: 'High-Speed FDM'
        });

        // --- Materials (Georgian market prices) ---
        await this.put('materials', {
            id: 'm1', type: 'PETG-HF', pricePerKg: 68,
            densityGCm3: 1.27, stockKg: 1.0, color: 'Black'
        });
        await this.put('materials', {
            id: 'm2', type: 'PLA', pricePerKg: 55,
            densityGCm3: 1.24, stockKg: 2.0, color: 'White'
        });
        await this.put('materials', {
            id: 'm3', type: 'ABS', pricePerKg: 60,
            densityGCm3: 1.04, stockKg: 1.5, color: 'Black'
        });
        await this.put('materials', {
            id: 'm4', type: 'PETG', pricePerKg: 50,
            densityGCm3: 1.27, stockKg: 1.0, color: 'Transparent'
        });

        // --- Overheads ---
        await this.put('overheads', {
            id: 'o1', label: 'Workspace Rent',
            amountPerMonth: 300, scope: 'global'
        });
        await this.put('overheads', {
            id: 'o2', label: 'Internet',
            amountPerMonth: 40, scope: 'global'
        });

        // --- Default client ---
        await this.put('clients', {
            id: 'c1', name: 'Walk-in Customer',
            email: '', phone: '', notes: 'Default walk-in client'
        });

        // --- Settings ---
        await this.put('settings', {
            id: 'app',
            electricityPerKwh: 0.18,
            defaultMargin: 100,
            defaultTax: 18,
            darkMode: false,
            workingHoursPerMonth: 160
        });

        // --- Real sample order: 30g PETG-HF on P2S, 2 hours ---
        await this.put('orders', {
            id: 'ord1',
            clientId: 'c1',
            date: new Date().toISOString(),
            deadline: '',
            status: 'completed',
            marginPct: 100,
            taxPct: 18,
            discountPct: 0,
            logisticsCost: 0,
            models: [{
                name: '30g PETG-HF Print',
                weightG: 30,
                printerId: 'p1',
                materialId: 'm1',
                estTimeHrs: 2,
                extras: []
            }]
        });

        return true; // seeded
    }
};
