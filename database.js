import fs from 'fs';
import { encrypt, decrypt } from './utils.js';

const DB_FILE = 'users.json';
const LOG_FILE = 'bot.log';

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function readJsonFile(file, fallback) {
    if (!fs.existsSync(file)) {
        writeJsonFile(file, fallback);
        return fallback;
    }

    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) {
        writeJsonFile(file, fallback);
        return fallback;
    }

    return JSON.parse(raw);
}

function writeJsonFile(file, data) {
    const tempFile = `${file}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, file);
}

export function getUsers() {
    try {
        const data = readJsonFile(DB_FILE, []);
        return data.map(user => ({
            ...user,
            pass: user.pass ? decrypt(user.pass) : ''
        }));
    } catch (error) {
        logError('Error reading users', error);
        return [];
    }
}

export function saveUsers(users) {
    try {
        const encryptedUsers = users.map(user => ({
            ...user,
            pass: user.pass ? encrypt(user.pass) : ''
        }));
        writeJsonFile(DB_FILE, encryptedUsers);
    } catch (error) {
        logError('Error saving users', error);
    }
}

export function getUserByNIM(nim) {
    return getUsers().find(u => u.nim === nim);
}

export function getUserByChatId(chatId) {
    return getUsers().find(u => u.chatId === chatId);
}

export function updateUser(nim, updates) {
    let users = getUsers();
    const index = users.findIndex(u => u.nim === nim);
    if (index !== -1) {
        users[index] = { ...users[index], ...updates };
        saveUsers(users);
        return users[index];
    }
    return null;
}

export function deleteUser(nim) {
    let users = getUsers();
    users = users.filter(u => u.nim !== nim);
    saveUsers(users);
}

export function logError(message, error) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}\n${error?.stack || error}\n\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
    console.error(logMessage);
}

export function logInfo(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO: ${message}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(logMessage);
}

export function logAbsensi(nim, matkul, status, persentase) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ABSENSI: NIM=${nim} | Matkul=${matkul} | Status=${status} | Persentase=${persentase}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
}

// === HISTORY & STATS ===
const HISTORY_FILE = 'attendance_history.json';

if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({}));
}

export function saveAttendanceHistory(nim, matkul, status, persentase) {
    try {
        const history = readJsonFile(HISTORY_FILE, {});

        if (!history[nim]) {
            history[nim] = [];
        }

        history[nim].unshift({
            matkul,
            status,
            persentase,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('id-ID')
        });

        // Keep only last 50 records per user
        if (history[nim].length > 50) {
            history[nim] = history[nim].slice(0, 50);
        }

        writeJsonFile(HISTORY_FILE, history);
    } catch (error) {
        logError('Error saving attendance history', error);
    }
}

export function getAttendanceHistory(nim, limit = 10) {
    try {
        const history = readJsonFile(HISTORY_FILE, {});
        return (history[nim] || []).slice(0, limit);
    } catch (error) {
        logError('Error reading attendance history', error);
        return [];
    }
}

export function getWeeklyStats(nim) {
    try {
        const history = readJsonFile(HISTORY_FILE, {});
        const userHistory = history[nim] || [];

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const weekData = userHistory.filter(h => new Date(h.timestamp) >= oneWeekAgo);

        const hadir = weekData.filter(h => h.status === 'BERHASIL_ABSEN' || h.status === 'SUDAH_HADIR').length;
        const belumBuka = weekData.filter(h => h.status === 'NOT_OPEN').length;

        // Calculate average percentage
        const persentaseData = weekData
            .filter(h => h.persentase && h.persentase !== '0%')
            .map(h => parseFloat(h.persentase.replace('%', '')));

        const avgPersentase = persentaseData.length > 0
            ? (persentaseData.reduce((a, b) => a + b, 0) / persentaseData.length).toFixed(1)
            : 0;

        // Find best and worst subjects
        const matkulStats = {};
        weekData.forEach(h => {
            if (!matkulStats[h.matkul]) {
                matkulStats[h.matkul] = [];
            }
            if (h.persentase && h.persentase !== '0%') {
                matkulStats[h.matkul].push(parseFloat(h.persentase.replace('%', '')));
            }
        });

        let best = null;
        let worst = null;
        let bestScore = 0;
        let worstScore = 100;

        Object.keys(matkulStats).forEach(matkul => {
            const scores = matkulStats[matkul];
            if (scores.length > 0) {
                const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                if (avg > bestScore) {
                    bestScore = avg;
                    best = { nama: matkul, persentase: avg.toFixed(1) };
                }
                if (avg < worstScore) {
                    worstScore = avg;
                    worst = { nama: matkul, persentase: avg.toFixed(1) };
                }
            }
        });

        return {
            hadir,
            belumBuka,
            avgPersentase,
            best,
            worst,
            total: weekData.length
        };
    } catch (error) {
        logError('Error calculating weekly stats', error);
        return null;
    }
}

// === ACHIEVEMENTS ===
const ACHIEVEMENTS_FILE = 'achievements.json';

if (!fs.existsSync(ACHIEVEMENTS_FILE)) {
    fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify({}));
}

// === KEY SYSTEM ===
const KEYS_FILE = 'keys.json';

if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify([]));
}

export function getKeys() {
    try {
        return readJsonFile(KEYS_FILE, []);
    } catch (error) {
        logError('Error reading keys', error);
        return [];
    }
}

export function saveKeys(keys) {
    try {
        writeJsonFile(KEYS_FILE, keys);
    } catch (error) {
        logError('Error saving keys', error);
    }
}

export function addKey(key) {
    const keys = getKeys();
    keys.push(key);
    saveKeys(keys);
}

export function findKey(code) {
    const keys = getKeys();
    return keys.find(k => k.code === code);
}

export function markKeyUsed(code, nim) {
    const keys = getKeys();
    const index = keys.findIndex(k => k.code === code);
    if (index !== -1) {
        keys[index].used = true;
        keys[index].usedBy = nim;
        keys[index].usedAt = new Date().toISOString();
        saveKeys(keys);
        return keys[index];
    }
    return null;
}

export function deleteKey(code) {
    let keys = getKeys();
    keys = keys.filter(k => k.code !== code);
    saveKeys(keys);
}

export function checkAndAwardAchievements(nim) {
    try {
        const achievements = readJsonFile(ACHIEVEMENTS_FILE, {});
        const history = readJsonFile(HISTORY_FILE, {});

        if (!achievements[nim]) {
            achievements[nim] = {
                perfectWeek: false,
                earlyBird: 0,
                neverMiss: 0,
                centurion: false
            };
        }

        const userHistory = history[nim] || [];
        const userAch = achievements[nim];
        const newAchievements = [];

        // Perfect Week - hadir semua minggu ini
        const weekStats = getWeeklyStats(nim);
        if (weekStats && weekStats.hadir >= 5 && !userAch.perfectWeek) {
            userAch.perfectWeek = true;
            newAchievements.push('🏆 Perfect Week - Hadir semua minggu ini!');
        }

        // Early Bird - absen sebelum jam kuliah
        const recentSuccess = userHistory.filter(h =>
            h.status === 'BERHASIL_ABSEN' &&
            new Date(h.timestamp).getDate() === new Date().getDate()
        ).length;

        if (recentSuccess > 0) {
            userAch.earlyBird += recentSuccess;
            if (userAch.earlyBird === 5) {
                newAchievements.push('🐦 Early Bird - Absen tepat waktu 5x!');
            }
        }

        // Centurion - 100% di salah satu matkul
        const has100 = userHistory.some(h => h.persentase === '100%' || h.persentase === '100.0%');
        if (has100 && !userAch.centurion) {
            userAch.centurion = true;
            newAchievements.push('💯 Centurion - Perfect attendance di satu matkul!');
        }

        writeJsonFile(ACHIEVEMENTS_FILE, achievements);

        return newAchievements;
    } catch (error) {
        logError('Error checking achievements', error);
        return [];
    }
}

export function getUserAchievements(nim) {
    try {
        const achievements = readJsonFile(ACHIEVEMENTS_FILE, {});
        return achievements[nim] || {
            perfectWeek: false,
            earlyBird: 0,
            neverMiss: 0,
            centurion: false
        };
    } catch (error) {
        return {
            perfectWeek: false,
            earlyBird: 0,
            neverMiss: 0,
            centurion: false
        };
    }
}
