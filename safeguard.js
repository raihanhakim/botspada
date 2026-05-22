// Safeguard System - Proteksi anti-ban tanpa proxy
// Fitur: daily cap, auto-backoff, IP ban detection, attendance cache

class Safeguard {
    constructor() {
        // === DAILY REQUEST CAP ===
        this.dailyRequestCount = 0;
        this.dailyLimit = 30; // Max 30 request ke SPADA per hari
        this.lastDailyReset = this._getToday();

        // === AUTO BACKOFF ===
        this.isPaused = false;
        this.pauseUntil = 0;
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 3; // Pause setelah 3 error berturut-turut

        // === ATTENDANCE CACHE ===
        // Cache status "sudah hadir" agar tidak cek ulang hari ini
        // Key: `${nim}_${matkulId}_${tanggal}`, Value: true
        this.attendanceCache = new Map();
        this.lastCacheClear = this._getToday();

        // === BATCH LIMIT ===
        this.maxUsersPerCycle = 2; // Max 2 user diproses per cycle cron
        this.userCycleIndex = new Map(); // Track posisi user per matkul

        // === BAN DETECTION ===
        this.banIndicators = 0; // Counter indikasi IP di-ban
        this.banThreshold = 3; // Setelah 3 indikasi, pause lama

        console.log('[Safeguard] Initialized - Daily limit:', this.dailyLimit, '| Max users/cycle:', this.maxUsersPerCycle);
    }

    _getToday() {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // === DAILY CAP ===
    canMakeRequest() {
        // Reset harian
        const today = this._getToday();
        if (today !== this.lastDailyReset) {
            this.dailyRequestCount = 0;
            this.lastDailyReset = today;
            this.banIndicators = 0; // Reset ban indicators juga
            console.log('[Safeguard] Daily reset - request count: 0');
        }

        if (this.dailyRequestCount >= this.dailyLimit) {
            console.log(`[Safeguard] Daily limit reached (${this.dailyRequestCount}/${this.dailyLimit}). No more requests today.`);
            return false;
        }
        return true;
    }

    incrementRequest() {
        this.dailyRequestCount++;
        console.log(`[Safeguard] Request count: ${this.dailyRequestCount}/${this.dailyLimit} today`);
    }

    // === AUTO BACKOFF ===
    isPausedNow() {
        if (!this.isPaused) return false;

        if (Date.now() >= this.pauseUntil) {
            this.isPaused = false;
            this.consecutiveErrors = 0;
            console.log('[Safeguard] Pause ended, resuming operations');
            return false;
        }

        const remaining = Math.ceil((this.pauseUntil - Date.now()) / 60000);
        console.log(`[Safeguard] Still paused. Resuming in ${remaining} minutes`);
        return true;
    }

    reportSuccess() {
        this.consecutiveErrors = 0;
        this.banIndicators = Math.max(0, this.banIndicators - 1); // Kurangi ban indicator
    }

    reportError(statusCode, errorCode) {
        this.consecutiveErrors++;

        // Deteksi indikasi ban
        if (statusCode === 403 || statusCode === 429 || statusCode === 503) {
            this.banIndicators++;
            console.log(`[Safeguard] Ban indicator: ${this.banIndicators}/${this.banThreshold} (HTTP ${statusCode})`);
        }

        if (errorCode === 'ECONNREFUSED' || errorCode === 'ECONNRESET') {
            this.banIndicators++;
            console.log(`[Safeguard] Ban indicator: ${this.banIndicators}/${this.banThreshold} (${errorCode})`);
        }

        // Jika terdeteksi ban, pause lama (60-120 menit)
        if (this.banIndicators >= this.banThreshold) {
            const pauseDuration = (60 + Math.floor(Math.random() * 60)) * 60 * 1000; // 60-120 menit
            this.isPaused = true;
            this.pauseUntil = Date.now() + pauseDuration;
            console.log(`[Safeguard] IP BAN DETECTED! Pausing for ${Math.ceil(pauseDuration / 60000)} minutes`);
            return 'ban_detected';
        }

        // Jika 3 error berturut-turut, pause 30-60 menit
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            const pauseDuration = (30 + Math.floor(Math.random() * 30)) * 60 * 1000; // 30-60 menit
            this.isPaused = true;
            this.pauseUntil = Date.now() + pauseDuration;
            console.log(`[Safeguard] ${this.consecutiveErrors} consecutive errors. Pausing for ${Math.ceil(pauseDuration / 60000)} minutes`);
            return 'backoff';
        }

        return 'continue';
    }

    // === ATTENDANCE CACHE ===
    isAlreadyPresent(nim, matkulId) {
        // Clear cache jika hari berganti
        const today = this._getToday();
        if (today !== this.lastCacheClear) {
            this.attendanceCache.clear();
            this.lastCacheClear = today;
        }

        const key = `${nim}_${matkulId}_${today}`;
        return this.attendanceCache.has(key);
    }

    markAsPresent(nim, matkulId) {
        const today = this._getToday();
        const key = `${nim}_${matkulId}_${today}`;
        this.attendanceCache.set(key, true);
        console.log(`[Safeguard] Cached: ${nim} already present for matkul ${matkulId}`);
    }

    // === BATCH LIMIT ===
    // Ambil batch user yang harus diproses cycle ini
    getUserBatch(users, matkulId) {
        const key = matkulId.toString();

        // Dapatkan index terakhir untuk matkul ini
        let startIndex = this.userCycleIndex.get(key) || 0;

        // Jika sudah melewati semua user, reset
        if (startIndex >= users.length) {
            startIndex = 0;
        }

        // Ambil batch
        const batch = users.slice(startIndex, startIndex + this.maxUsersPerCycle);
        
        // Update index untuk cycle berikutnya
        this.userCycleIndex.set(key, startIndex + this.maxUsersPerCycle);

        console.log(`[Safeguard] Processing batch: user ${startIndex + 1}-${startIndex + batch.length} of ${users.length} for matkul ${matkulId}`);
        return batch;
    }

    // === STATUS ===
    getStatus() {
        return {
            dailyRequests: `${this.dailyRequestCount}/${this.dailyLimit}`,
            isPaused: this.isPaused,
            pauseRemaining: this.isPaused ? `${Math.ceil((this.pauseUntil - Date.now()) / 60000)} min` : 'N/A',
            consecutiveErrors: this.consecutiveErrors,
            banIndicators: `${this.banIndicators}/${this.banThreshold}`,
            cachedAttendance: this.attendanceCache.size,
            maxUsersPerCycle: this.maxUsersPerCycle
        };
    }
}

// Export singleton
export const safeguard = new Safeguard();
