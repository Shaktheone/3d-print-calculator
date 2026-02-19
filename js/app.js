/**
 * app.js — Application bootstrapper, section routing, dark mode
 */

const App = {
    currentSection: 'dashboard',

    /** Bootstrap the application */
    async init() {
        console.log('[App] init() starting...');
        try {
            // Step 1: Open IndexedDB
            console.log('[App] Step 1: Opening IndexedDB...');
            await DB.open();
            console.log('[App] Step 1: ✅ DB opened');

            // Step 2: Seed sample data if DB is empty
            console.log('[App] Step 2: Checking seed data...');
            const seeded = await DB.seedIfEmpty();
            if (seeded) {
                console.log('[App] Step 2: ✅ Sample data seeded');
                Utils.showToast('Welcome! Sample data loaded with Georgian defaults (₾)', 'info');
            } else {
                console.log('[App] Step 2: ✅ Data already exists, skip seed');
            }

            // Step 3: Restore dark mode
            console.log('[App] Step 3: Loading settings...');
            const settings = await DB.getSettings();
            if (settings.darkMode) {
                document.documentElement.setAttribute('data-bs-theme', 'dark');
                this.updateDarkModeUI(true);
            }
            console.log('[App] Step 3: ✅ Settings loaded');

            // Step 4: Setup navigation
            console.log('[App] Step 4: Setting up navigation...');
            this.setupNav();
            console.log('[App] Step 4: ✅ Nav ready');

            // Step 5: Dark mode toggles
            document.getElementById('dark-mode-toggle')?.addEventListener('click', () => this.toggleDarkMode());
            document.getElementById('dark-mode-mobile')?.addEventListener('click', () => this.toggleDarkMode());

            // Step 6: Initialize Orders section
            console.log('[App] Step 6: Initializing Orders...');
            await Orders.init();
            console.log('[App] Step 6: ✅ Orders initialized');

            // Step 7: Pre-render ALL sections so tables are populated immediately
            console.log('[App] Step 7: Pre-rendering all sections...');
            const sections = ['printers', 'materials', 'overheads', 'clients', 'statistics', 'history', 'settings'];
            for (const s of sections) {
                try {
                    console.log(`[App]   Rendering ${s}...`);
                    await this.renderSection(s);
                    console.log(`[App]   ✅ ${s} rendered`);
                } catch (sectionErr) {
                    console.error(`[App]   ❌ ${s} render failed:`, sectionErr);
                }
            }
            console.log('[App] Step 7: ✅ All sections pre-rendered');

            // Step 8: Show dashboard (renders dashboard data and makes it visible)
            console.log('[App] Step 8: Showing dashboard...');
            await this.showSection('dashboard');
            console.log('[App] Step 8: ✅ Dashboard shown');

            console.log('[App] ✅ INIT COMPLETE — all systems go');
        } catch (e) {
            console.error('[App] ❌ INIT FAILED at step above:', e);
            // Try to show error as a visible overlay so user can see even without DevTools
            try {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#dc3545;color:#fff;padding:16px 24px;border-radius:12px;font-family:monospace;font-size:14px;max-width:80vw;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
                overlay.innerHTML = `<b>⚠️ App Init Error:</b><br>${e.message}<br><small>Open DevTools (F12) → Console for details</small>`;
                document.body.appendChild(overlay);
                setTimeout(() => overlay.remove(), 15000);
            } catch (_) { }
            Utils.showToast('Failed to initialize app: ' + e.message, 'error');
        }
    },

    /** Setup sidebar nav click handlers */
    setupNav() {
        document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                if (section) this.showSection(section);

                // Close offcanvas on mobile
                const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('sidebarNav'));
                if (offcanvas) offcanvas.hide();
            });
        });
    },

    /** Show a section by name */
    async showSection(name) {
        // Hide all sections
        document.querySelectorAll('.app-section').forEach(s => s.classList.add('d-none'));

        // Show target
        const target = document.getElementById('section-' + name);
        if (target) {
            target.classList.remove('d-none');
        }

        // Update nav active state
        document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.section === name);
        });

        this.currentSection = name;

        // Render section data
        await this.renderSection(name);
    },

    /** Render a specific section's data */
    async renderSection(name) {
        try {
            switch (name) {
                case 'dashboard':
                    await this.renderDashboard();
                    break;
                case 'printers':
                    await Printers.render();
                    break;
                case 'materials':
                    await Materials.render();
                    break;
                case 'overheads':
                    await Overheads.render();
                    break;
                case 'clients':
                    await Clients.render();
                    break;
                case 'orders':
                    await Orders.populateDropdowns();
                    await Orders.updateBreakdown();
                    break;
                case 'statistics':
                    await Statistics.render();
                    break;
                case 'history':
                    await History.render();
                    break;
                case 'settings':
                    await Settings.render();
                    break;
            }
        } catch (err) {
            console.error(`[App] renderSection('${name}') failed:`, err);
        }
    },

    /** Refresh the currently visible section */
    async refreshCurrentSection() {
        await this.renderSection(this.currentSection);
    },

    /** Render dashboard summary */
    async renderDashboard() {
        const orders = await DB.getAll('orders');
        const printers = await DB.getAll('printers');
        const materials = await DB.getAll('materials');

        document.getElementById('dash-orders').textContent = orders.length;
        const totalRevenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
        document.getElementById('dash-revenue').textContent = Utils.formatGEL(totalRevenue);
        document.getElementById('dash-printers').textContent = printers.length;
        document.getElementById('dash-materials').textContent = materials.length;

        // Recent orders (last 5)
        const clients = await DB.getAll('clients');
        const clientMap = {};
        clients.forEach(c => clientMap[c.id] = c.name);

        const recent = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        const tbody = document.getElementById('dash-recent-orders');

        if (!recent.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No orders yet</td></tr>`;
            return;
        }

        tbody.innerHTML = recent.map(o => `
      <tr style="cursor:pointer" onclick="Orders.loadOrder('${o.id}')">
        <td>${Utils.formatDate(o.date)}</td>
        <td>${Utils.escapeHtml(clientMap[o.clientId] || '—')}</td>
        <td>${Utils.statusBadge(o.status)}</td>
        <td class="text-end gel-value">${Utils.formatGEL(o.totalPrice || 0)}</td>
      </tr>
    `).join('');
    },

    /** Toggle dark mode */
    async toggleDarkMode() {
        const html = document.documentElement;
        const isDark = html.getAttribute('data-bs-theme') === 'dark';
        const newMode = !isDark;
        html.setAttribute('data-bs-theme', newMode ? 'dark' : 'light');
        this.updateDarkModeUI(newMode);

        // Persist
        const settings = await DB.getSettings();
        settings.darkMode = newMode;
        await DB.put('settings', settings);
    },

    /** Update dark mode button UI */
    updateDarkModeUI(isDark) {
        const icon = document.getElementById('dark-mode-icon');
        const label = document.getElementById('dark-mode-label');
        const mobileBtn = document.getElementById('dark-mode-mobile');

        if (icon) icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
        if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        if (mobileBtn) {
            mobileBtn.innerHTML = isDark ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-fill"></i>';
        }
    }
};

// ====== Boot ======
console.log('[App] app.js loaded ✅ — waiting for DOMContentLoaded...');
document.addEventListener('DOMContentLoaded', () => App.init());

// Global error handler — catches uncaught errors from other scripts too
window.addEventListener('error', (e) => {
    console.error('[GLOBAL ERROR]', e.message, 'at', e.filename, 'line', e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[UNHANDLED PROMISE REJECTION]', e.reason);
});

