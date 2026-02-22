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

    /**
     * Initialize: check localStorage for saved config and auto-connect if found.
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

        // Try auto-connect from saved config
        const savedConfig = localStorage.getItem('firebase_config');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                await this.connect(config, true); // silent = true (no toast on auto-connect)
            } catch (e) {
                console.error('[FirebaseSync] Auto-connect failed:', e);
            }
        }
    },

    /**
     * Connect to Firebase with the provided config object.
     * @param {Object} config - Firebase config {apiKey, authDomain, projectId, ...}
     * @param {boolean} silent - If true, suppress success toast (used for auto-connect)
     */
    async connect(config, silent = false) {
        try {
            // Validate required fields
            if (!config.apiKey || !config.projectId) {
                throw new Error('API Key and Project ID are required');
            }

            // Clean up existing app if any
            if (this.app) {
                try { await this.app.delete(); } catch (_) { }
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
                    console.warn('[FirebaseSync] Persistence not supported in this browser');
                }
            }

            // Save config to localStorage for auto-reconnect
            localStorage.setItem('firebase_config', JSON.stringify(config));

            this.updateStatusUI();

            if (!silent) {
                Utils.showToast('Firebase connected! Cloud sync active.', 'success');
            }
            console.log('[FirebaseSync] Connected to project:', config.projectId);

            // Download cloud data if newer
            await this.downloadIfNewer();

        } catch (e) {
            console.error('[FirebaseSync] Connection failed:', e);
            this.app = null;
            this.db = null;
            this.updateStatusUI();
            Utils.showToast('Firebase connection failed: ' + e.message, 'error');
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
        console.log('[FirebaseSync] Disconnected');
    },

    /**
     * Check if Firebase is connected.
     */
    isConnected() {
        return !!(this.app && this.db);
    },

    /**
     * Upload all local data to Firestore.
     * Exports the full IndexedDB state and writes it as a single Firestore document.
     */
    async uploadAll() {
        if (!this.isConnected()) return;

        try {
            const data = await DB.exportAll();
            data.lastModified = Date.now();
            data._source = 'local-upload';

            await this.db.doc(this._docPath).set(data);
            console.log('[FirebaseSync] ✅ Uploaded all data to Firestore');
        } catch (e) {
            console.error('[FirebaseSync] Upload failed:', e);
            // Don't show error toast for network issues — Firestore will retry automatically
            if (e.code !== 'unavailable') {
                Utils.showToast('Cloud sync failed: ' + e.message, 'error');
            }
        }
    },

    /**
     * Download data from Firestore and overwrite local IndexedDB.
     * Used for Force Download — always overwrites.
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
            // Remove metadata fields before importing
            delete cloudData.lastModified;
            delete cloudData._source;

            await DB.importAll(cloudData);
            App.refreshCurrentSection();

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
                // No cloud data yet — do initial upload
                console.log('[FirebaseSync] No cloud data found, doing initial upload');
                await this.uploadAll();
                return;
            }

            const cloudData = snapshot.data();
            const cloudTimestamp = cloudData.lastModified || 0;

            // Check local timestamp
            const localTimestamp = parseInt(localStorage.getItem('firebase_lastSync') || '0', 10);

            if (cloudTimestamp > localTimestamp) {
                console.log('[FirebaseSync] Cloud data is newer, downloading...');
                // Remove metadata fields before importing
                const importData = { ...cloudData };
                delete importData.lastModified;
                delete importData._source;

                await DB.importAll(importData);
                localStorage.setItem('firebase_lastSync', String(cloudTimestamp));
                App.refreshCurrentSection();

                Utils.showToast('Synced newer data from cloud', 'info');
            } else {
                console.log('[FirebaseSync] Local data is current, no download needed');
            }
        } catch (e) {
            console.error('[FirebaseSync] Download check failed:', e);
            // Silently fail on load — don't block the app
        }
    },

    /**
     * Debounced upload — called after every DB mutation.
     * Batches rapid changes into a single Firestore write.
     */
    scheduleUpload() {
        if (!this.isConnected()) return;

        clearTimeout(this._uploadTimer);
        this._uploadTimer = setTimeout(async () => {
            await this.uploadAll();
            // Update local sync timestamp
            localStorage.setItem('firebase_lastSync', String(Date.now()));
        }, this._debounceMs);
    },

    /**
     * Update the Firebase status UI in Settings.
     */
    updateStatusUI() {
        const badge = document.getElementById('firebase-status-badge');
        const connectedControls = document.getElementById('firebase-connected-controls');
        const connectBtn = document.getElementById('firebase-connect-btn');
        const configInputs = document.getElementById('firebase-config-inputs');

        if (!badge) return; // UI not rendered yet

        if (this.isConnected()) {
            badge.textContent = 'Connected';
            badge.className = 'badge bg-success ms-2';
            if (connectedControls) connectedControls.classList.remove('d-none');
            if (connectBtn) connectBtn.classList.add('d-none');
            if (configInputs) configInputs.classList.add('opacity-50');
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
     * Populate Settings form inputs from saved config.
     */
    populateFormFromSaved() {
        const saved = localStorage.getItem('firebase_config');
        if (!saved) return;
        try {
            const config = JSON.parse(saved);
            const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
            fields.forEach(f => {
                const el = document.getElementById('fb-' + f);
                if (el && config[f]) el.value = config[f];
            });
        } catch (_) { }
    },

    /**
     * Handle "Connect Firebase" button click.
     */
    async handleConnect() {
        const config = this.getConfigFromForm();
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
        localStorage.setItem('firebase_lastSync', String(Date.now()));
        Utils.showToast('All data uploaded to cloud!', 'success');
    },

    /**
     * Handle "Force Download" button click.
     */
    async handleForceDownload() {
        if (!this.isConnected()) return;
        Utils.showToast('Downloading data from cloud...', 'info');
        await this.downloadAll();
        localStorage.setItem('firebase_lastSync', String(Date.now()));
    }
};
