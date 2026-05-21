// Key System - Generate & Redeem activation keys
import crypto from 'crypto';
import { getKeys, addKey, findKey, markKeyUsed, deleteKey, logInfo, logError } from './database.js';
import { sendTele, sendTeleWithKeyboard } from './telegram.js';
import { getUsers, updateUser, getUserByChatId } from './database.js';
import { hitungSisaHari, tambahHari } from './utils.js';

// === GENERATE KEY ===

function generateKeyCode(prefix = 'SPADA') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Tanpa I,O,0,1 biar ga bingung
    let code = '';
    for (let i = 0; i < 4; i++) {
        let segment = '';
        for (let j = 0; j < 4; j++) {
            segment += chars[crypto.randomInt(chars.length)];
        }
        code += (i > 0 ? '-' : '') + segment;
    }
    return `${prefix}-${code}`;
}

/**
 * Generate key baru
 * @param {number} duration - Durasi dalam hari
 * @param {number} count - Jumlah key yang digenerate
 * @param {string} note - Catatan (opsional)
 * @returns {Array} Array of generated keys
 */
export function generateKeys(duration, count = 1, note = '') {
    const generated = [];

    for (let i = 0; i < count; i++) {
        const key = {
            code: generateKeyCode(),
            duration: duration, // dalam hari
            used: false,
            usedBy: null,
            usedAt: null,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Key expired dalam 30 hari jika tidak dipakai
            note: note
        };

        addKey(key);
        generated.push(key);
    }

    logInfo(`Generated ${count} key(s) with ${duration} days duration`);
    return generated;
}

// === REDEEM KEY ===

/**
 * Redeem key untuk aktivasi/perpanjang
 * @param {string} chatId
 * @param {string} code - Kode key
 * @returns {object} Result
 */
export async function redeemKey(chatId, code) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return {
            success: false,
            message: '❌ Kamu belum daftar. Ketik `/input NIM PASSWORD NAMA` dulu ya.'
        };
    }

    // Normalize code (uppercase, trim)
    code = code.trim().toUpperCase();

    // Cari key
    const key = findKey(code);

    if (!key) {
        return {
            success: false,
            message: '❌ Key tidak ditemukan. Cek lagi kodenya ya.'
        };
    }

    if (key.used) {
        return {
            success: false,
            message: `❌ Key sudah dipakai oleh NIM: ${key.usedBy} pada ${new Date(key.usedAt).toLocaleDateString('id-ID')}.`
        };
    }

    // Cek apakah key sudah expired
    if (new Date() > new Date(key.expiresAt)) {
        return {
            success: false,
            message: '❌ Key sudah kadaluarsa. Minta key baru ke admin.'
        };
    }

    // Proses redeem
    const duration = key.duration;
    let expireDate;

    if (user.status === 'active') {
        // Perpanjang dari tanggal expire yang ada
        const currentExpire = new Date(user.expireAt);
        const now = new Date();
        const baseDate = currentExpire > now ? currentExpire : now;
        expireDate = new Date(baseDate.getTime() + duration * 24 * 60 * 60 * 1000).toISOString();
    } else {
        // Aktivasi baru dari sekarang
        expireDate = tambahHari(duration);
    }

    // Update user
    updateUser(user.nim, {
        status: 'active',
        activatedAt: new Date().toISOString(),
        expireAt: expireDate
    });

    // Mark key as used
    markKeyUsed(code, user.nim);

    const sisaHari = hitungSisaHari(expireDate);
    const isExtend = user.status === 'active';

    logInfo(`Key redeemed: ${code} by ${user.nim} (${duration} days, ${isExtend ? 'extend' : 'new activation'})`);

    return {
        success: true,
        message: `🎉 *${isExtend ? 'Perpanjangan' : 'Aktivasi'} Berhasil!*\n\n🔑 Key: \`${code}\`\n⏰ Durasi: ${duration} hari\n📅 Berlaku sampai: ${new Date(expireDate).toLocaleDateString('id-ID')}\n⏳ Sisa masa aktif: ${sisaHari} hari\n\nSelamat! Bot absen kamu sudah aktif.`,
        nim: user.nim,
        duration: duration,
        isExtend: isExtend
    };
}

// === ADMIN: LIST KEYS ===

export function getKeyStats() {
    const keys = getKeys();
    const unused = keys.filter(k => !k.used && new Date(k.expiresAt) > new Date());
    const used = keys.filter(k => k.used);
    const expired = keys.filter(k => !k.used && new Date(k.expiresAt) <= new Date());

    return {
        total: keys.length,
        unused: unused.length,
        used: used.length,
        expired: expired.length,
        keys: keys
    };
}

export function getUnusedKeys() {
    const keys = getKeys();
    return keys.filter(k => !k.used && new Date(k.expiresAt) > new Date());
}

// === ADMIN HANDLERS ===

export async function handleAdminGenerateKey(chatId, args) {
    // Format: /genkey DURASI [JUMLAH] [CATATAN]
    // Contoh: /genkey 30
    // Contoh: /genkey 7 5
    // Contoh: /genkey 30 3 promo_mei

    if (!args || args.length === 0) {
        return sendTele(chatId, 
            `🔑 *Generate Key*\n\nFormat:\n\`/genkey DURASI [JUMLAH] [CATATAN]\`\n\n` +
            `Contoh:\n` +
            `• \`/genkey 30\` - 1 key, 30 hari\n` +
            `• \`/genkey 7 5\` - 5 key, 7 hari\n` +
            `• \`/genkey 30 3 promo\` - 3 key, 30 hari, catatan "promo"\n\n` +
            `Durasi tersedia: 7, 14, 30, 60, 90 hari`
        );
    }

    const duration = parseInt(args[0]);
    const count = parseInt(args[1]) || 1;
    const note = args.slice(2).join(' ') || '';

    if (isNaN(duration) || duration < 1 || duration > 365) {
        return sendTele(chatId, '❌ Durasi harus antara 1-365 hari.');
    }

    if (count < 1 || count > 20) {
        return sendTele(chatId, '❌ Jumlah key harus antara 1-20.');
    }

    const keys = generateKeys(duration, count, note);

    let msg = `🔑 *Key Berhasil Digenerate!*\n\n`;
    msg += `⏰ Durasi: ${duration} hari\n`;
    msg += `📦 Jumlah: ${count}\n`;
    if (note) msg += `📝 Catatan: ${note}\n`;
    msg += `\n━━━━━━━━━━━━━━━━━━\n\n`;

    keys.forEach((k, i) => {
        msg += `${i + 1}. \`${k.code}\`\n`;
    });

    msg += `\n━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 Key berlaku 30 hari sejak digenerate.\n`;
    msg += `User redeem dengan: \`/redeem KODE\``;

    await sendTele(chatId, msg);
}

export async function handleAdminKeyList(chatId) {
    const stats = getKeyStats();

    let msg = `🔑 *Key Management*\n━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📊 Total: ${stats.total}\n`;
    msg += `✅ Belum dipakai: ${stats.unused}\n`;
    msg += `🔴 Sudah dipakai: ${stats.used}\n`;
    msg += `⏰ Kadaluarsa: ${stats.expired}\n\n`;

    const unused = getUnusedKeys();
    if (unused.length > 0) {
        msg += `*Key Tersedia:*\n\n`;
        unused.forEach((k, i) => {
            const expDate = new Date(k.expiresAt).toLocaleDateString('id-ID');
            msg += `${i + 1}. \`${k.code}\`\n`;
            msg += `   ${k.duration} hari | Exp: ${expDate}`;
            if (k.note) msg += ` | ${k.note}`;
            msg += `\n\n`;
        });
    } else {
        msg += `_Tidak ada key tersedia. Generate dengan /genkey_`;
    }

    const keyboard = [
        [
            { text: '➕ Generate Key', callback_data: 'adm_key_gen_menu' },
            { text: '🗑️ Hapus Expired', callback_data: 'adm_key_clean' }
        ],
        [
            { text: '📋 History Redeem', callback_data: 'adm_key_history' },
            { text: '◀️ Kembali', callback_data: 'adm_back' }
        ]
    ];

    await sendTeleWithKeyboard(chatId, msg, keyboard);
}

export async function handleAdminKeyHistory(chatId) {
    const keys = getKeys().filter(k => k.used);

    if (keys.length === 0) {
        return sendTele(chatId, '📋 Belum ada key yang di-redeem.');
    }

    let msg = `📋 *History Redeem*\n━━━━━━━━━━━━━━━━━━\n\n`;

    // Show last 15
    const recent = keys.slice(-15).reverse();
    recent.forEach((k, i) => {
        const date = new Date(k.usedAt).toLocaleDateString('id-ID');
        msg += `${i + 1}. \`${k.code}\`\n`;
        msg += `   NIM: ${k.usedBy} | ${k.duration}hr | ${date}\n\n`;
    });

    await sendTele(chatId, msg);
}

export async function handleAdminKeyClean(chatId) {
    let keys = getKeys();
    const before = keys.length;
    keys = keys.filter(k => k.used || new Date(k.expiresAt) > new Date());
    const removed = before - keys.length;

    const { saveKeys } = await import('./database.js');
    saveKeys(keys);

    await sendTele(chatId, `🗑️ Berhasil hapus ${removed} key kadaluarsa.`);
}

// Quick generate callbacks
export async function handleKeyGenCallback(chatId, duration) {
    const keys = generateKeys(duration, 1);
    const key = keys[0];

    await sendTele(chatId, `🔑 *Key Baru*\n\n\`${key.code}\`\n\n⏰ Durasi: ${duration} hari\nUser redeem: \`/redeem ${key.code}\``);
}
