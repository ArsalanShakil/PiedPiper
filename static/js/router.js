// Hash-based SPA router
const Router = {
    routes: {},
    currentView: null,
    container: null,

    init(containerId) {
        this.container = document.getElementById(containerId);
        window.addEventListener('hashchange', () => this.navigate());
        this.navigate();
    },

    register(hash, config) {
        this.routes[hash] = config;
    },

    async navigate() {
        const hash = location.hash || '#/';
        const route = this.routes[hash];

        if (!route) {
            // Try prefix matching for routes like #/editor/123
            const matched = Object.keys(this.routes).find(r => hash.startsWith(r));
            if (matched) {
                await this._load(this.routes[matched], hash);
                return;
            }
            location.hash = '#/';
            return;
        }

        await this._load(route, hash);
    },

    async _load(route, hash) {
        // Destroy current view
        if (this.currentView && this.currentView.destroy) {
            this.currentView.destroy();
        }

        // Update nav active state
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.toggle('active', el.getAttribute('href') === hash);
        });

        // Load partial HTML
        try {
            const res = await fetch(`/partials/${route.partial}`);
            if (!res.ok) throw new Error('Partial not found');
            this.container.innerHTML = await res.text();
        } catch (err) {
            this.container.innerHTML = `<div class="error-state"><h2>Page not found</h2></div>`;
            return;
        }

        // Initialize view JS
        if (route.init) {
            this.currentView = route.init(hash);
        } else {
            this.currentView = null;
        }
    }
};
