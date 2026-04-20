// Request Queue System untuk mencegah request bentrok ke SPADA
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = 0;
        this.minDelayBetweenRequests = 8000; // Minimum 8 detik antar request
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
                // Pastikan ada jeda minimal antar request
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;

                if (timeSinceLastRequest < this.minDelayBetweenRequests) {
                    const waitTime = this.minDelayBetweenRequests - timeSinceLastRequest;
                    await new Promise(r => setTimeout(r, waitTime));
                }

                // Jalankan task
                const result = await task();
                this.lastRequestTime = Date.now();

                // Random delay tambahan 2-4 detik untuk keamanan ekstra
                const extraDelay = 2000 + Math.floor(Math.random() * 2000);
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
