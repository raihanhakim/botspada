// Request Queue System untuk mencegah request bentrok ke SPADA
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = 0;
        this.requestCount = 0;
        this.hourlyResetTime = Date.now();

        // SMART DELAY MODE - Natural pattern
        // Delay 90-180 detik antar request (1.5-3 menit) - lebih aman
        this.minDelayBetweenRequests = 90000; // 90 detik
        this.maxDelayBetweenRequests = 180000; // 180 detik

        // Batasi max request per jam
        this.maxRequestsPerHour = 15; // Turunkan dari 20 ke 15 untuk lebih aman

        // Time-of-day awareness: kurangi agresivitas di luar jam kuliah
        this.peakHours = { start: 7, end: 17 }; // Jam 7-17 = jam kuliah
    }

    async add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }

    // Cek apakah sekarang jam sibuk (jam kuliah)
    isPeakHour() {
        const hour = new Date().getHours();
        return hour >= this.peakHours.start && hour <= this.peakHours.end;
    }

    // Hitung delay berdasarkan waktu - lebih lambat di luar jam sibuk
    calculateDelay() {
        const baseDelay = this.minDelayBetweenRequests;
        const variance = this.maxDelayBetweenRequests - this.minDelayBetweenRequests;

        // Distribusi non-uniform (lebih banyak delay pendek, kadang delay panjang)
        const randomFactor = Math.random() * Math.random();
        let delay = baseDelay + Math.floor(variance * randomFactor);

        // Di luar jam sibuk, tambah delay 50-100% lebih lama
        if (!this.isPeakHour()) {
            delay = Math.floor(delay * (1.5 + Math.random() * 0.5));
        }

        // Kadang-kadang (10% chance) tambah delay ekstra panjang (simulasi user AFK)
        if (Math.random() < 0.1) {
            delay += Math.floor(Math.random() * 120000); // +0-120 detik ekstra
        }

        return delay;
    }

    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const { task, resolve, reject } = this.queue.shift();

            try {
                const now = Date.now();

                // Reset counter setiap jam
                if (now - this.hourlyResetTime > 3600000) {
                    this.requestCount = 0;
                    this.hourlyResetTime = now;
                    console.log(`[Queue] Hourly reset - Request count reset to 0`);
                }

                // Cek limit per jam
                if (this.requestCount >= this.maxRequestsPerHour) {
                    const waitUntilReset = 3600000 - (now - this.hourlyResetTime);
                    console.log(`[Queue] Rate limit reached. Waiting ${Math.ceil(waitUntilReset / 60000)} minutes...`);
                    await new Promise(r => setTimeout(r, waitUntilReset));
                    this.requestCount = 0;
                    this.hourlyResetTime = Date.now();
                }

                const timeSinceLastRequest = now - this.lastRequestTime;
                const requiredDelay = this.calculateDelay();

                if (timeSinceLastRequest < requiredDelay) {
                    const waitTime = requiredDelay - timeSinceLastRequest;
                    console.log(`[Queue] Waiting ${Math.ceil(waitTime / 1000)}s before next request...`);
                    await new Promise(r => setTimeout(r, waitTime));
                }

                // Jalankan task
                console.log(`[Queue] Processing request ${this.requestCount + 1}/${this.maxRequestsPerHour} this hour (queue: ${this.queue.length} remaining)`);
                const result = await task();
                this.lastRequestTime = Date.now();
                this.requestCount++;

                // Random delay tambahan 10-30 detik untuk keamanan ekstra
                const extraDelay = 10000 + Math.floor(Math.random() * 20000);
                await new Promise(r => setTimeout(r, extraDelay));

                resolve(result);
            } catch (error) {
                reject(error);
            }
        }

        this.processing = false;
    }

    getQueueLength() {
        return this.queue.length;
    }

    isProcessing() {
        return this.processing;
    }

    getStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            requestsThisHour: this.requestCount,
            maxPerHour: this.maxRequestsPerHour,
            isPeakHour: this.isPeakHour()
        };
    }
}

// Export singleton instance
export const requestQueue = new RequestQueue();
