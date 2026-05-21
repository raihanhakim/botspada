// Admin Panel via Telegram - Menu lengkap tanpa perlu hafal command
import { sendTele, sendTeleWithKeyboard } from './telegram.js';
import { getUsers, updateUser, logInfo, logError, getAttendanceHistory } from './database.js';
import { getJadwalHariIni, getAllMatkul, JADWAL_KULIAH } from './jadwal.js';
import { safeguard } from './safeguard.js';
import { requestQueue } from './queue.js';
import { hitungSisaHari, tambahHari } from './utils.js';
import { prosesAbsen } from './spada.js';
import { handleAdminKeyList, handleAdminKeyHistory, handleAdminKeyClean, handleKeyGenCallback } from './keySystem.js';

// === ADMIN KEYBOARDS ===

function adminMainMenu() {
    return [
        [
            { text: '📊 Dashboard', callback_data: 'adm_dashboard' },
            { text: '👥 Users', callback_data: 'adm_users' }
        ],
        [
            { text: '🔑 Keys', callback_data: 'adm_keys' },
            { text: '🛡️ Safeguard', callback_data: 'adm_safeguard' }
        ],
        [
            { text: '⚙️ System', callback_data: 'adm_system' },
            { text: '🚀 Actions', callback_data: 'adm_actions' }
        ],
        [
            { text: '📢 Broadcast', callback_data: 'adm_broadcast_menu' }
        ]
    ];
}

function adminUsersMenu() {
    return [
        [
            { text: '📋 List Semua', callback_data: 'adm_user_list' },
            { text: '🟢 User Aktif', callback_data: 'adm_user_active' }
        ],
        [
            { text: '🔴 User Inactive', callback_data: 'adm_user_inactive' },
            { text: '🟠 User Expired', callback_data: 'adm_user_expired' }
        ],
        [
            { text: '➕ Aktivasi Manual', callback_data: 'adm_user_activate' },
            { text: '➖ Deactivate', callback_data: 'adm_user_deactivate' }
        ],
        [
            { text: '🗑️ Hapus User', callback_data: 'adm_user_delete' },
            { text: '◀️ Kembali', callback_data: 'adm_back' }
        ]
    ];
}

function adminSafeguardMenu() {
    return [
        [
            { text: '📊 Status Safeguard', callback_data: 'adm_sg_status' },
            { text: '⏸️ Pause System', callback_data: 'adm_sg_pause' }
        ],
        [
            { text: '▶️ Resume System', callback_data: 'adm_sg_resume' },
            { text: '🔄 Reset Counters', callback_data: 'adm_sg_reset' }
        ],
        [
            { text: '◀️ Kembali', callback_data: 'adm_back' }
        ]
    ];
}

function adminSystemMenu() {
    return [
        [
            { text: '📈 Queue Status', callback_data: 'adm_sys_queue' }
        ],
        [
            { text: '📅 Jadwal Hari Ini', callback_data: 'adm_sys_jadwal' },
            { text: '🕐 Uptime', callback_data: 'adm_sys_uptime' }
        ],
        [
            { text: '◀️ Kembali', callback_data: 'adm_back' }
        ]
    ];
}

function adminActionsMenu() {
    return [
        [
            { text: '🔄 Force Absen All', callback_data: 'adm_act_forceall' },
            { text: '🔄 Force 1 User', callback_data: 'adm_act_force1' }
        ],
        [
            { text: '🏖️ Libur Semua', callback_data: 'adm_act_liburall' },
            { text: '📚 Masuk Semua', callback_data: 'adm_act_masukall' }
        ],
        [
            { text: '◀️ Kembali', callback_data: 'adm_back' }
        ]
    ];
}

// === HANDLER FUNCTIONS ===

export async function handleAdminPanel(chatId) {
    const users = getUsers();
    const aktif = users.filter(u => u.status === 'active').length;
    const total = users.length;

    const msg = `🔐 *ADMIN PANEL*\n\n👥 Total User: ${total}\n🟢 Aktif: ${aktif}\n\nPilih menu di bawah:`;
    await sendTeleWithKeyboard(chatId, msg, adminMainMenu());
}

export async function handleAdminCallback(chatId, callbackData) {
    switch (callbackData) {
        case 'adm_back':
            return handleAdminPanel(chatId);

        // === DASHBOARD ===
        case 'adm_dashboard':
            return handleDashboard(chatId);

        // === KEYS ===
        case 'adm_keys':
            return handleAdminKeyList(chatId);
        case 'adm_key_gen_menu':
            return handleKeyGenMenu(chatId);
        case 'adm_key_gen_7':
            return handleKeyGenCallback(chatId, 7);
        case 'adm_key_gen_14':
            return handleKeyGenCallback(chatId, 14);
        case 'adm_key_gen_30':
            return handleKeyGenCallback(chatId, 30);
        case 'adm_key_gen_60':
            return handleKeyGenCallback(chatId, 60);
        case 'adm_key_gen_90':
            return handleKeyGenCallback(chatId, 90);
        case 'adm_key_history':
            return handleAdminKeyHistory(chatId);
        case 'adm_key_clean':
            return handleAdminKeyClean(chatId);

        // === USERS ===
        case 'adm_users':
            return sendTeleWithKeyboard(chatId, '👥 *User Management*\n\nPilih aksi:', adminUsersMenu());
        case 'adm_user_list':
            return handleUserList(chatId, 'all');
        case 'adm_user_active':
            return handleUserList(chatId, 'active');
        case 'adm_user_inactive':
            return handleUserList(chatId, 'inactive');
        case 'adm_user_expired':
            return handleUserList(chatId, 'expired');
        case 'adm_user_activate':
            return sendTele(chatId, '➕ *Aktivasi Manual*\n\nKetik:\n`/acc NIM`\n\nContoh: `/acc 12345678`');
        case 'adm_user_deactivate':
            return sendTele(chatId, '➖ *Deactivate User*\n\nKetik:\n`/deactivate NIM`\n\nContoh: `/deactivate 12345678`');
        case 'adm_user_delete':
            return sendTele(chatId, '🗑️ *Hapus User*\n\nKetik:\n`/adminhapus NIM`\n\nContoh: `/adminhapus 12345678`');

        // === SAFEGUARD ===
        case 'adm_safeguard':
            return sendTeleWithKeyboard(chatId, '🛡️ *Safeguard Control*\n\nKontrol sistem keamanan:', adminSafeguardMenu());
        case 'adm_sg_status':
            return handleSafeguardStatus(chatId);
        case 'adm_sg_pause':
            return handleSafeguardPause(chatId);
        case 'adm_sg_resume':
            return handleSafeguardResume(chatId);
        case 'adm_sg_reset':
            return handleSafeguardReset(chatId);

        // === SYSTEM ===
        case 'adm_system':
            return sendTeleWithKeyboard(chatId, '⚙️ *System Info*\n\nPilih info:', adminSystemMenu());
        case 'adm_sys_queue':
            return handleQueueStatus(chatId);
        case 'adm_sys_jadwal':
            return handleJadwalStatus(chatId);
        case 'adm_sys_uptime':
            return handleUptime(chatId);

        // === ACTIONS ===
        case 'adm_actions':
            return sendTeleWithKeyboard(chatId, '🚀 *Quick Actions*\n\nPilih aksi:', adminActionsMenu());
        case 'adm_act_forceall':
            return handleForceAbsenAll(chatId);
        case 'adm_act_force1':
            return sendTele(chatId, '🔄 *Force Absen 1 User*\n\nKetik:\n`/cek NIM`\n\nContoh: `/cek 12345678`');
        case 'adm_act_liburall':
            return handleLiburAll(chatId);
        case 'adm_act_masukall':
            return handleMasukAll(chatId);

        // === BROADCAST ===
        case 'adm_broadcast_menu':
            return sendTele(chatId, '📢 *Broadcast Message*\n\nKetik:\n`/broadcast Pesan kamu di sini`\n\nPesan akan dikirim ke SEMUA user aktif.');

        default:
            return handleAdminPanel(chatId);
    }
}

// === KEY GEN MENU ===
async function handleKeyGenMenu(chatId) {
    const keyboard = [
        [
            { text: '7 Hari', callback_data: 'adm_key_gen_7' },
            { text: '14 Hari', callback_data: 'adm_key_gen_14' },
            { text: '30 Hari', callback_data: 'adm_key_gen_30' }
        ],
        [
            { text: '60 Hari', callback_data: 'adm_key_gen_60' },
            { text: '90 Hari', callback_data: 'adm_key_gen_90' }
        ],
        [
            { text: '◀️ Kembali', callback_data: 'adm_keys' }
        ]
    ];

    await sendTeleWithKeyboard(chatId, '🔑 *Generate Key*\n\nPilih durasi key:\n\nAtau ketik manual:\n`/genkey DURASI [JUMLAH] [CATATAN]`\n\nContoh: `/genkey 30 5 promo`', keyboard);
}

// === DASHBOARD ===
async function handleDashboard(chatId) {
    const users = getUsers();
    const aktif = users.filter(u => u.status === 'active');
    const inactive = users.filter(u => u.status === 'inactive');
    const expired = users.filter(u => u.status === 'expired');
    const skipMode = users.filter(u => u.skipMode === true);

    const matkuls = getJadwalHariIni();
    const sgStatus = safeguard.getStatus();
    const queueStatus = requestQueue.getStatus();

    // Hitung revenue
    const totalRevenue = aktif.length * parseInt(process.env.HARGA_BOT || 2000);

    // User yang expire dalam 3 hari
    const expiringSoon = aktif.filter(u => {
        const sisa = hitungSisaHari(u.expireAt);
        return sisa > 0 && sisa <= 3;
    });

    let msg = `📊 *DASHBOARD ADMIN*\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `👥 *Users*\n`;
    msg += `├ Total: ${users.length}\n`;
    msg += `├ 🟢 Aktif: ${aktif.length}\n`;
    msg += `├ 🔴 Inactive: ${inactive.length}\n`;
    msg += `├ 🟠 Expired: ${expired.length}\n`;
    msg += `├ 🏖️ Mode Libur: ${skipMode.length}\n`;
    msg += `└ ⚠️ Expire < 3 hari: ${expiringSoon.length}\n\n`;

    msg += `📅 *Jadwal Hari Ini*\n`;
    if (matkuls.length > 0) {
        matkuls.forEach(m => {
            msg += `├ ${m.nama} (${m.jam})\n`;
        });
    } else {
        msg += `└ Tidak ada jadwal\n`;
    }
    msg += `\n`;

    msg += `🛡️ *Safeguard*\n`;
    msg += `├ Request hari ini: ${sgStatus.dailyRequests}\n`;
    msg += `├ Status: ${sgStatus.isPaused ? '⏸️ PAUSED' : '▶️ RUNNING'}\n`;
    msg += `├ Ban indicators: ${sgStatus.banIndicators}\n`;
    msg += `└ Cache absen: ${sgStatus.cachedAttendance} entries\n\n`;

    msg += `⚙️ *System*\n`;
    msg += `├ Queue: ${queueStatus.queueLength} pending\n`;
    msg += `├ Processing: ${queueStatus.processing ? 'Ya' : 'Tidak'}\n`;
    msg += `└ Peak hour: ${queueStatus.isPeakHour ? 'Ya' : 'Tidak'}\n\n`;

    msg += `💰 *Revenue*\n`;
    msg += `└ Est. bulan ini: Rp${totalRevenue.toLocaleString('id-ID')}\n`;

    await sendTeleWithKeyboard(chatId, msg, adminMainMenu());
}

// === USER LIST ===
async function handleUserList(chatId, filter) {
    const users = getUsers();
    let filtered;
    let title;

    switch (filter) {
        case 'active':
            filtered = users.filter(u => u.status === 'active');
            title = '🟢 User Aktif';
            break;
        case 'inactive':
            filtered = users.filter(u => u.status === 'inactive');
            title = '🔴 User Inactive';
            break;
        case 'expired':
            filtered = users.filter(u => u.status === 'expired');
            title = '🟠 User Expired';
            break;
        default:
            filtered = users;
            title = '📋 Semua User';
    }

    if (filtered.length === 0) {
        return sendTeleWithKeyboard(chatId, `${title}\n\nTidak ada user.`, adminUsersMenu());
    }

    let msg = `${title} (${filtered.length})\n━━━━━━━━━━━━━━━━━━\n\n`;

    filtered.forEach((u, i) => {
        const sisa = u.status === 'active' ? ` | Sisa: ${hitungSisaHari(u.expireAt)}hr` : '';
        const skip = u.skipMode ? ' 🏖️' : '';
        msg += `${i + 1}. *${u.nama}*${skip}\n`;
        msg += `   NIM: \`${u.nim}\` | ${u.status}${sisa}\n`;
        if (u.username) msg += `   Tele: ${u.username}\n`;
        msg += `\n`;
    });

    // Split message jika terlalu panjang
    if (msg.length > 4000) {
        const chunks = splitMessage(msg, 4000);
        for (const chunk of chunks) {
            await sendTele(chatId, chunk);
        }
        return sendTeleWithKeyboard(chatId, 'Pilih aksi:', adminUsersMenu());
    }

    await sendTeleWithKeyboard(chatId, msg, adminUsersMenu());
}

// === SAFEGUARD CONTROLS ===
async function handleSafeguardStatus(chatId) {
    const status = safeguard.getStatus();

    let msg = `🛡️ *Safeguard Status*\n━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📊 Request hari ini: ${status.dailyRequests}\n`;
    msg += `⏸️ Paused: ${status.isPaused ? 'YA' : 'Tidak'}\n`;
    if (status.isPaused) {
        msg += `⏰ Resume dalam: ${status.pauseRemaining}\n`;
    }
    msg += `❌ Consecutive errors: ${status.consecutiveErrors}\n`;
    msg += `🚨 Ban indicators: ${status.banIndicators}\n`;
    msg += `💾 Attendance cache: ${status.cachedAttendance} entries\n`;
    msg += `👥 Max users/cycle: ${status.maxUsersPerCycle}\n`;

    await sendTeleWithKeyboard(chatId, msg, adminSafeguardMenu());
}

async function handleSafeguardPause(chatId) {
    safeguard.isPaused = true;
    safeguard.pauseUntil = Date.now() + (60 * 60 * 1000); // Pause 1 jam
    logInfo('Admin manually paused safeguard for 1 hour');
    await sendTeleWithKeyboard(chatId, '⏸️ Sistem di-pause selama *1 jam*.\n\nSemua auto-absen dihentikan sementara.', adminSafeguardMenu());
}

async function handleSafeguardResume(chatId) {
    safeguard.isPaused = false;
    safeguard.pauseUntil = 0;
    safeguard.consecutiveErrors = 0;
    safeguard.banIndicators = 0;
    logInfo('Admin manually resumed safeguard');
    await sendTeleWithKeyboard(chatId, '▶️ Sistem di-resume!\n\nAuto-absen kembali aktif.', adminSafeguardMenu());
}

async function handleSafeguardReset(chatId) {
    safeguard.dailyRequestCount = 0;
    safeguard.consecutiveErrors = 0;
    safeguard.banIndicators = 0;
    safeguard.attendanceCache.clear();
    logInfo('Admin reset all safeguard counters');
    await sendTeleWithKeyboard(chatId, '🔄 Semua counter di-reset!\n\n• Daily request: 0\n• Errors: 0\n• Ban indicators: 0\n• Attendance cache: cleared', adminSafeguardMenu());
}

// === SYSTEM STATUS ===
async function handleQueueStatus(chatId) {
    const status = requestQueue.getStatus();

    let msg = `📈 *Queue Status*\n━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📦 Pending: ${status.queueLength} tasks\n`;
    msg += `⚙️ Processing: ${status.processing ? 'Ya' : 'Tidak'}\n`;
    msg += `📊 Request jam ini: ${status.requestsThisHour}/${status.maxPerHour}\n`;
    msg += `🕐 Peak hour: ${status.isPeakHour ? 'Ya (delay normal)' : 'Tidak (delay lebih lama)'}\n`;

    await sendTeleWithKeyboard(chatId, msg, adminSystemMenu());
}

async function handleJadwalStatus(chatId) {
    const matkuls = getJadwalHariIni();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const today = days[new Date().getDay()];

    let msg = `📅 *Jadwal Hari Ini (${today})*\n━━━━━━━━━━━━━━━━━━\n\n`;

    if (matkuls.length === 0) {
        msg += `Tidak ada jadwal hari ini. Libur!\n`;
    } else {
        matkuls.forEach((m, i) => {
            const now = new Date();
            const [jam, mnt] = m.jam.split(':');
            const target = new Date();
            target.setHours(parseInt(jam), parseInt(mnt), 0);
            const diff = Math.round((now - target) / (1000 * 60));

            let status = '⏳ Belum mulai';
            if (diff >= 0 && diff <= 60) status = '🟢 Sedang berlangsung';
            else if (diff > 60) status = '✅ Selesai';

            msg += `${i + 1}. *${m.nama}*\n`;
            msg += `   Jam: ${m.jam} | ID: ${m.id}\n`;
            msg += `   Status: ${status}\n\n`;
        });
    }

    await sendTeleWithKeyboard(chatId, msg, adminSystemMenu());
}

const startTime = Date.now();

async function handleUptime(chatId) {
    const uptime = Date.now() - startTime;
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);

    const memUsage = process.memoryUsage();
    const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(1);

    let msg = `🕐 *System Uptime*\n━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s\n`;
    msg += `💾 Memory (Heap): ${heapMB} MB\n`;
    msg += `💾 Memory (RSS): ${rssMB} MB\n`;
    msg += `📦 Node: ${process.version}\n`;
    msg += `🖥️ Platform: ${process.platform}\n`;

    await sendTeleWithKeyboard(chatId, msg, adminSystemMenu());
}

// === ACTIONS ===
async function handleForceAbsenAll(chatId) {
    const matkuls = getJadwalHariIni();

    if (matkuls.length === 0) {
        return sendTele(chatId, '❌ Tidak ada jadwal hari ini.');
    }

    const aktif = getUsers().filter(u => u.status === 'active' && !u.skipMode);

    if (aktif.length === 0) {
        return sendTele(chatId, '❌ Tidak ada user aktif.');
    }

    await sendTele(chatId, `🔄 Memulai force absen untuk ${aktif.length} user x ${matkuls.length} matkul...\n\nProses berjalan di background. Notifikasi akan dikirim per user.`);

    // Jalankan di background
    (async () => {
        let success = 0;
        let failed = 0;
        let skipped = 0;

        for (const m of matkuls) {
            for (const u of aktif) {
                if (safeguard.isPausedNow() || !safeguard.canMakeRequest()) {
                    skipped++;
                    continue;
                }

                try {
                    const result = await prosesAbsen(u, m, true);
                    if (result.status === 'success' || result.status === 'already_present' || result.status === 'cached_present') {
                        success++;
                    } else {
                        skipped++;
                    }
                } catch (e) {
                    failed++;
                }
            }
        }

        await sendTele(chatId, `✅ *Force Absen Selesai*\n\n✅ Berhasil: ${success}\n❌ Gagal: ${failed}\n⏭️ Skipped: ${skipped}`);
    })();
}

async function handleLiburAll(chatId) {
    const users = getUsers().filter(u => u.status === 'active');
    let count = 0;

    for (const u of users) {
        updateUser(u.nim, { skipMode: true, skipModeDate: new Date().toISOString() });
        count++;
    }

    logInfo(`Admin set libur for all ${count} active users`);
    await sendTeleWithKeyboard(chatId, `🏖️ *Mode Libur Aktif*\n\n${count} user diset ke mode libur.\nAuto-absen dinonaktifkan untuk hari ini.`, adminActionsMenu());
}

async function handleMasukAll(chatId) {
    const users = getUsers().filter(u => u.skipMode === true);
    let count = 0;

    for (const u of users) {
        updateUser(u.nim, { skipMode: false, skipModeDate: null });
        count++;
    }

    logInfo(`Admin set masuk for all ${count} users`);
    await sendTeleWithKeyboard(chatId, `📚 *Mode Masuk Aktif*\n\n${count} user dikembalikan ke mode masuk.\nAuto-absen kembali aktif.`, adminActionsMenu());
}

// === BROADCAST ===
export async function handleBroadcast(chatId, message) {
    if (!message || message.trim().length === 0) {
        return sendTele(chatId, '❌ Pesan broadcast tidak boleh kosong.\n\nFormat: `/broadcast Pesan kamu`');
    }

    const aktif = getUsers().filter(u => u.status === 'active');

    if (aktif.length === 0) {
        return sendTele(chatId, '❌ Tidak ada user aktif untuk broadcast.');
    }

    await sendTele(chatId, `📢 Mengirim broadcast ke ${aktif.length} user...`);

    let sent = 0;
    let failed = 0;

    for (const u of aktif) {
        try {
            await sendTele(u.chatId, `📢 *Pesan dari Admin:*\n\n${message}`);
            sent++;
            // Delay kecil antar pesan agar tidak kena rate limit Telegram
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            failed++;
        }
    }

    await sendTele(chatId, `✅ *Broadcast Selesai*\n\n📨 Terkirim: ${sent}\n❌ Gagal: ${failed}`);
}

// === HELPER ===
function splitMessage(msg, maxLength) {
    const chunks = [];
    while (msg.length > 0) {
        if (msg.length <= maxLength) {
            chunks.push(msg);
            break;
        }
        let splitIndex = msg.lastIndexOf('\n', maxLength);
        if (splitIndex === -1) splitIndex = maxLength;
        chunks.push(msg.substring(0, splitIndex));
        msg = msg.substring(splitIndex);
    }
    return chunks;
}
