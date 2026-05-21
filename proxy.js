// Proxy Rotation System untuk menghindari IP ban
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

class ProxyRotator {
    constructor() {
        this.proxies = [];
        this.currentIndex = 0;
        this.userProxyMap = new Map(); // Map user -> proxy untuk mode per_user
        this.failedProxies = new Set(); // Track proxy yang gagal
        this.mode = process.env.PROXY_MODE || 'per_request';
        this.loadProxies();
    }

    loadProxies() {
        const proxyList = process.env.PROXY_LIST || '';
        if (!proxyList.trim()) {
            console.log('[Proxy] Tidak ada proxy dikonfigurasi. Menggunakan IP langsung.');
            return;
        }

        this.proxies = proxyList.split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        console.log(`[Proxy] Loaded ${this.proxies.length} proxy(s) - Mode: ${this.mode}`);
    }

    hasProxies() {
        return this.proxies.length > 0;
    }

    // Dapatkan proxy berikutnya (round-robin)
    getNextProxy() {
        if (!this.hasProxies()) return null;

        // Skip proxy yang gagal
        let attempts = 0;
        while (attempts < this.proxies.length) {
            const proxy = this.proxies[this.currentIndex];
            this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

            if (!this.failedProxies.has(proxy)) {
                return proxy;
            }
            attempts++;
        }

        // Kalau semua gagal, reset dan coba lagi
        console.log('[Proxy] Semua proxy gagal, reset failed list...');
        this.failedProxies.clear();
        const proxy = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        return proxy;
    }

    // Dapatkan proxy untuk user tertentu (sticky per user)
    getProxyForUser(userId) {
        if (!this.hasProxies()) return null;

        if (this.mode === 'per_user') {
            if (!this.userProxyMap.has(userId)) {
                // Assign proxy baru untuk user ini
                const proxy = this.getNextProxy();
                this.userProxyMap.set(userId, proxy);
            }
            const assignedProxy = this.userProxyMap.get(userId);
            // Kalau proxy-nya gagal, reassign
            if (this.failedProxies.has(assignedProxy)) {
                const newProxy = this.getNextProxy();
                this.userProxyMap.set(userId, newProxy);
                return newProxy;
            }
            return assignedProxy;
        }

        // Mode per_request: rotasi setiap request
        return this.getNextProxy();
    }

    // Buat agent dari proxy URL
    createAgent(proxyUrl) {
        if (!proxyUrl) return undefined;

        try {
            if (proxyUrl.startsWith('socks')) {
                return new SocksProxyAgent(proxyUrl);
            }
            return new HttpsProxyAgent(proxyUrl);
        } catch (error) {
            console.error(`[Proxy] Error creating agent for ${proxyUrl}:`, error.message);
            this.markFailed(proxyUrl);
            return undefined;
        }
    }

    // Tandai proxy sebagai gagal
    markFailed(proxyUrl) {
        if (proxyUrl) {
            this.failedProxies.add(proxyUrl);
            console.log(`[Proxy] Marked as failed: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`);
        }
    }

    // Reset proxy yang gagal (dipanggil periodik)
    resetFailed() {
        this.failedProxies.clear();
        console.log('[Proxy] Reset failed proxies list');
    }

    getStatus() {
        return {
            total: this.proxies.length,
            failed: this.failedProxies.size,
            active: this.proxies.length - this.failedProxies.size,
            mode: this.mode
        };
    }
}

// Export singleton
export const proxyRotator = new ProxyRotator();
