// Request Queue System untuk mencegah request bentrok ke SPADA
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = 0;
        // PRIORITAS KEAMANAN MAKSIMAL - Untuk 20-30 NIM
        // Delay 30-45 detik antar request untuk menghindari banned IP
        this.minDelayBetweenRequests = 30000; // Base 30 detik (sangat aman)
        this.maxDelayBetweenRequests = 45000; // Max 45 detik (variasi tinggi)
    }

    async add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const { task, resolve, reject } = this.queue.shift();

            try {
                // Pastikan ada jeda minimal antar request dengan variasi random
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;

                // Random delay antara min dan max untuk menghindari pola konsisten
                const randomDelay = this.minDelayBetweenRequests +
                    Math.floor(Math.random() * (this.maxDelayBetweenRequests - this.minDelayBetweenRequests));

                if (timeSinceLastRequest < randomDelay) {
                    const waitTime = randomDelay - timeSinceLastRequest;
                    await new Promise(r => setTimeout(r, waitTime));
                }

                // Jalankan task
                const result = await task();
                this.lastRequestTime = Date.now();

                // Random delay tambahan 4-8 detik untuk keamanan ekstra maksimal
                const extraDelay = 4000 + Math.floor(Math.random() * 4000);
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
}

// Export singleton instance
export const requestQueue = new RequestQueue();
