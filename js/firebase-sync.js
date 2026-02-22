/**
 * firebase-sync.js — Firebase Firestore automatic cloud sync
 * Mirrors local IndexedDB data to Firestore for cross-device access.
 * Local IndexedDB remains the primary store (fast + offline).
 * Firestore acts as a cloud mirror with last-write-wins conflict resolution.
 */

const FirebaseSync = {
    app: null,
    db: null,
    _uploadTimer: null,
    _debounceMs: 500,
    _docPath: 'app-data/backup',

    // Default config — hardcoded for zero-setup on any device
    _defaultConfig: {
        apiKey: "AIzaSyDsmuzwg_jp1ElNRfSwpQY7iYKUechqYPc",
        authDomain: "dcalculator-f7760.firebaseapp.com",
        projectId: "dcalculator-f7760",
        storageBucket: "dcalculator-f7760.firebasestorage.app",
        messagingSenderId: "820801176255",
        appId: "1:820801176255:web:2edabb42c3838b3ec23c0a"
    },

    /**
     * Initialize: auto-connect using saved config or default config.
     * Called during App.init() boot sequence.
     */
    async init() {
        console.log('[FirebaseSync] init()');
        this.updateStatusUI();

        // Listen for online/offline events
        window.addEventListener('online', () => {
            console.log('[FirebaseSync] Browser went online');
            if (this.isConnected()) {
                Utils.showToast('Back online — syncing to cloud...', 'info');
                this.scheduleUpload();
            }
        });

        // Determine config: saved > default
        let config = null;
        const savedConfig = localStorage.getItem('firebase_config');
        if (savedConfig) {
            try {
                config = JSON.parse(savedConfig);
            } catch (_) { }
        }
        if (!config || !config.apiKey) {
            config = this._defaultConfig;
        }

        // Auto-connect
        try {
            await this.connect(config, true); // silent = true
            console.log('[FirebaseSync] ✅ Auto-connected on init');
        } catch (e) {
            console.error('[FirebaseSync] Auto-connect failed:', e);
        }
    },

    /**
     * Connect to Firebase with the provided config object.
     */
    async connect(config, silent = false) {
        try {
            if (!config.apiKey || !config.projectId) {
                throw new Error('API Key and Project ID are required');
            }

            // Clean up existing app
            if (this.app) {
                try { await this.app.delete(); } catch (_) { }
                this.app = null;
                this.db = null;
            }

            // Initialize Firebase
            this.app = firebase.initializeApp(config);
            this.db = firebase.firestore();

            // Enable offline persistence
            try {
                await this.db.enablePersistence({ synchronizeTabs: true });
                console.log('[FirebaseSync] Offline persistence enabled');
            } catch (e) {
                if (e.code === 'failed-precondition') {
                    console.warn('[FirebaseSync] Persistence failed: multiple tabs open');
                } else if (e.code === 'unimplemented') {
                    console.warn('[FirebaseSync] Persistence not supported');
                }
            }

            // Save config to localStorage
            localStorage.setItem('firebase_config', JSON.stringify(config));

            this.updateStatusUI();

            if (!silent) {
                Utils.showToast('Firebase connected! Cloud sync active.', 'success');
            }
            console.log('[FirebaseSync] Connected to project:', config.projectId);

            // Download cloud data if newer
            await this.downloadIfNewer();

            // Update UI again after sync (picks up lastSync timestamp)
            this.updateStatusUI();

        } catch (e) {
            console.error('[FirebaseSync] Connection failed:', e);
            this.app = null;
            this.db = null;
            this.updateStatusUI();
            if (!silent) {
                Utils.showToast('Firebase connection failed: ' + e.message, 'error');
            }
            throw e;
        }
    },

    /**
     * Disconnect from Firebase and clear saved config.
     */
    async disconnect() {
        try {
            if (this.app) {
                await this.app.delete();
            }
        } catch (_) { }

        this.app = null;
        this.db = null;
        localStorage.removeItem('firebase_config');
        this.updateStatusUI();
        Utils.showToast('Firebase disconnected', 'info');
    },

    /**
     * Check if Firebase is connected.
     */
    isConnected() {
        return !!(this.app && this.db);
    },

    /**
     * Upload all local data to Firestore.
     */
    async uploadAll() {
        if (!this.isConnected()) return;

        try {
            const data = await DB.exportAll();
            data.lastModified = Date.now();
            data._source = 'local-upload';

            await this.db.doc(this._docPath).set(data);

            // Update last sync time
            const now = Date.now();
            localStorage.setItem('firebase_lastSync', String(now));
            this._updateLastSyncUI(now);

            console.log('[FirebaseSync] ✅ Uploaded all data to Firestore');
        } catch (e) {
            console.error('[FirebaseSync] Upload failed:', e);
            if (e.code !== 'unavailable') {
                Utils.showToast('Cloud sync failed: ' + e.message, 'error');
            }
        }
    },

    /**
     * Download data from Firestore and OVERWRITE local IndexedDB.
     * Clears local stores first for a clean import (handles deletions).
     */
    async downloadAll() {
        if (!this.isConnected()) return;

        try {
            const snapshot = await this.db.doc(this._docPath).get();
            if (!snapshot.exists) {
                Utils.showToast('No cloud data found. Upload first.', 'warning');
                return;
            }

            const cloudData = snapshot.data();
            delete cloudData.lastModified;
            delete cloudData._source;

            // Clear local stores THEN import (handles deleted items)
            await DB.clearAllSilent();
            await DB.importAllSilent(cloudData);
            App.refreshCurrentSection();

            const now = Date.now();
            localStorage.setItem('firebase_lastSync', String(now));
            this._updateLastSyncUI(now);

            Utils.showToast('Cloud data loaded successfully!', 'success');
            console.log('[FirebaseSync] ✅ Downloaded all data from Firestore');
        } catch (e) {
            console.error('[FirebaseSync] Download failed:', e);
            Utils.showToast('Cloud download failed: ' + e.message, 'error');
        }
    },

    /**
     * Download from Firestore ONLY if cloud data is newer than local.
     * Called during init/page load.
     */
    async downloadIfNewer() {
        if (!this.isConnected()) return;

        try {
            const snapshot = await this.db.doc(this._docPath).get();
            if (!snapshot.exists) {
                console.log('[FirebaseSync] No cloud data found, doing initial upload');
                await this.uploadAll();
                return;
            }

            const cloudData = snapshot.data();
            const cloudTimestamp = cloudData.lastModified || 0;
            const localTimestamp = parseInt(localStorage.getItem('firebase_lastSync') || '0', 10);

            if (cloudTimestamp > localTimestamp) {
                console.log('[FirebaseSync] Cloud data is newer, downloading...');
                const importData = { ...cloudData };
                delete importData.lastModified;
                delete importData._source;

                // Clear + re-import for clean sync (handles deletions)
                await DB.clearAllSilent();
                await DB.importAllSilent(importData);

                const now = Date.now();
                localStorage.setItem('firebase_lastSync', String(cloudTimestamp));
                this._updateLastSyncUI(now);

                App.refreshCurrentSection();
                Utils.showToast('Synced newer data from cloud', 'info');
            } else {
                console.log('[FirebaseSync] Local data is current, no download needed');
                this._updateLastSyncUI(localTimestamp);
            }
        } catch (e) {
            console.error('[FirebaseSync] Download check failed:', e);
        }
    },

    /**
     * Debounced upload — called after every DB mutation.
     */
    scheduleUpload() {
        if (!this.isConnected()) return;

        clearTimeout(this._uploadTimer);
        this._uploadTimer = setTimeout(async () => {
            await this.uploadAll();
        }, this._debounceMs);
    },

    /**
     * Update the "Last sync" time UI.
     */
    _updateLastSyncUI(timestamp) {
        const el = document.getElementById('firebase-last-sync');
        const timeEl = document.getElementById('firebase-last-sync-time');
        if (!el || !timeEl) return;

        if (timestamp && timestamp > 0) {
            const d = new Date(timestamp);
            timeEl.textContent = d.toLocaleString();
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    },

    /**
     * Update the Firebase status UI in Settings.
     */
    updateStatusUI() {
        const badge = document.getElementById('firebase-status-badge');
        const connectedControls = document.getElementById('firebase-connected-controls');
        const connectBtn = document.getElementById('firebase-connect-btn');
        const configInputs = document.getElementById('firebase-config-inputs');

        if (!badge) return;

        if (this.isConnected()) {
            badge.textContent = 'Connected';
            badge.className = 'badge bg-success ms-2';
            if (connectedControls) connectedControls.classList.remove('d-none');
            if (connectBtn) connectBtn.classList.add('d-none');
            if (configInputs) configInputs.classList.add('opacity-50');

            // Show last sync time
            const lastSync = parseInt(localStorage.getItem('firebase_lastSync') || '0', 10);
            this._updateLastSyncUI(lastSync);
        } else {
            badge.textContent = 'Not connected';
            badge.className = 'badge bg-secondary ms-2';
            if (connectedControls) connectedControls.classList.add('d-none');
            if (connectBtn) connectBtn.classList.remove('d-none');
            if (configInputs) configInputs.classList.remove('opacity-50');
        }
    },

    /**
     * Read Firebase config values from the Settings form inputs.
     */
    getConfigFromForm() {
        return {
            apiKey: (document.getElementById('fb-apiKey')?.value || '').trim(),
            authDomain: (document.getElementById('fb-authDomain')?.value || '').trim(),
            projectId: (document.getElementById('fb-projectId')?.value || '').trim(),
            storageBucket: (document.getElementById('fb-storageBucket')?.value || '').trim(),
            messagingSenderId: (document.getElementById('fb-messagingSenderId')?.value || '').trim(),
            appId: (document.getElementById('fb-appId')?.value || '').trim()
        };
    },

    /**
     * Populate Settings form inputs from saved config or defaults.
     */
    populateFormFromSaved() {
        let config = null;
        const saved = localStorage.getItem('firebase_config');
        if (saved) {
            try { config = JSON.parse(saved); } catch (_) { }
        }
        if (!config) {
            config = this._defaultConfig;
        }
        const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        fields.forEach(f => {
            const el = document.getElementById('fb-' + f);
            if (el && config[f]) el.value = config[f];
        });
    },

    /**
     * Handle "Connect Firebase" button click.
     */
    async handleConnect() {
        const config = this.getConfigFromForm();
        // Fall back to defaults if form is empty
        if (!config.apiKey) {
            Object.assign(config, this._defaultConfig);
        }
        try {
            await this.connect(config);
        } catch (_) { /* error already shown in connect() */ }
    },

    /**
     * Handle "Force Upload" button click.
     */
    async handleForceUpload() {
        if (!this.isConnected()) return;
        Utils.showToast('Uploading all data to cloud...', 'info');
        await this.uploadAll();
        Utils.showToast('All data uploaded to cloud!', 'success');
    },

    /**
     * Handle "Force Download" button click.
     */
    async handleForceDownload() {
        if (!this.isConnected()) return;
        Utils.showToast('Downloading data from cloud...', 'info');
        await this.downloadAll();
    }
};
