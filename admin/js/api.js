/**
 * API abstraction for simple admin portal requests
 */
const API = {
    async handleResponse(response) {
        if (response.status === 401) {
            // Unauthenticated
            if (!window.location.pathname.endsWith('login.html')) {
                window.location.href = '/admin/login.html';
                return Promise.reject('Unauthorized');
            }
        }
        const isJson = response.headers.get('content-type')?.includes('application/json');

        if (!response.ok) {
            let errMsg = 'API Error';
            if (isJson) {
                const errData = await response.json();
                errMsg = errData.error || errMsg;
                if (errData.details) errMsg += ' ' + JSON.stringify(errData.details);
            } else {
                errMsg = await response.text();
            }
            throw new Error(errMsg);
        }
        return isJson ? response.json() : response.text();
    },

    async request(url, options = {}) {
        const headers = { ...options.headers };

        // Add JSON content type if body is object and not FormData
        if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, { ...options, headers });
        return this.handleResponse(response);
    },

    // --- Auth Endpoints ---
    login(email, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: { email, password }
        });
    },

    logout() {
        return this.request('/api/auth/logout', { method: 'POST' });
    },

    getMe() {
        return this.request('/api/me')
            .then(res => res.user);
    },

    // --- Directory Meta ---
    getRegions() { return this.request('/api/regions'); },
    getProducts() { return this.request('/api/products'); },
    getSources() { return this.request('/api/sources'); },

    // --- Price Records CRUD ---
    getPrices(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/price-records?${query}`);
    },

    createPriceRecord(data) {
        return this.request('/api/price-records', { method: 'POST', body: data });
    },

    updatePriceRecord(id, data) {
        return this.request(`/api/price-records/${id}`, { method: 'PUT', body: data });
    },

    deletePriceRecord(id) {
        return this.request(`/api/price-records/${id}`, { method: 'DELETE' });
    },

    // --- Utils ---
    getExportUrl(params = {}) {
        const query = new URLSearchParams(params).toString();
        return `/api/price-records-export-csv?${query}`;
    },

    importCsv(file) {
        const formData = new FormData();
        formData.append('csvFile', file);
        return this.request('/api/price-records-import-csv', {
            method: 'POST',
            body: formData
        });
    }
};

// Global UI toast utility
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
