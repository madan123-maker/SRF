export class ApiService {
    constructor() {
        const host = window.location.host;
        // Hardcoded dev port if we are on Vite default 5173
        this.baseUrl = window.location.protocol + '//' + host;
        if (this.baseUrl.includes('5173')) {
            this.baseUrl = 'http://localhost:5001';
        } else if (this.baseUrl.includes('api.srf')) {
            // Production URL if needed
        }
    }

    getToken() {
        try {
            const sessionRaw = sessionStorage.getItem('srf_session_v2');
            if (sessionRaw) {
                const sess = JSON.parse(sessionRaw);
                return sess?.token;
            }
        } catch (e) { }
        return null;
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        if (!options.headers) options.headers = {};
        const token = this.getToken();
        if (token && !options.headers['Authorization']) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        // Crucial: Support new HTTP-Only tokens sent by backend during auth upgrade
        options.credentials = 'include';

        try {
            const response = await fetch(url, options);

            // Automatic interceptor for 401s
            if (response.status === 401 && !endpoint.includes('/api/login') && !endpoint.includes('/api/auth/refresh')) {
                // Let an interceptor hook or AppEngine handle token refresh
                window.dispatchEvent(new CustomEvent('api:unauthorized'));
            }

            return response;
        } catch (error) {
            console.error('[ApiService Error]', error);
            throw error;
        }
    }

    async get(endpoint, headers = {}) {
        return this.request(endpoint, { method: 'GET', headers });
    }

    async post(endpoint, body, headers = {}) {
        return this.request(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : null
        });
    }

    async put(endpoint, body, headers = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : null
        });
    }

    async delete(endpoint, headers = {}) {
        return this.request(endpoint, { method: 'DELETE', headers });
    }

    // Backwards compatibility for the legacy codebase
    interceptNativeFetch() {
        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
            // Allow relative local assets directly without interception
            if (typeof url === 'string' && (url.endsWith('.html') || url.endsWith('.svg') || url.endsWith('.json') && !url.includes('/api/'))) {
                return originalFetch(url, options);
            }
            return this.request(url, options);
        };
    }
}

export const API = new ApiService();
API.interceptNativeFetch();
