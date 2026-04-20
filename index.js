import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { sendTele, sendPhoto, getUpdates, checkCooldown, createMainKeyboard, answerCallback, sendTeleWithKeyboard } from './telegram.js';
import { prosesAbsen } from './spada.js';
import { getJadwalHariIni, getAllMatkul, JADWAL_KULIAH } from './jadwal.js';
import { createPayment, checkPaymentStatus, generateOrderId } from './pakasir.js';
import {
    getUsers,
    saveUsers,
    getUserByChatId,
    getUserByNIM,
    updateUser,
    logError,
    logInfo,
    logAbsensi,
    getAttendanceHistory,
    getWeeklyStats,
    saveAttendanceHistory,
    checkAndAwardAchievements,
    getUserAchievements
} from './database.js';
import {
    validateNIM,
    validatePassword,
    hitungSisaHari,
    tambahHari
} from './utils.js';

dotenv.config();

const TELE_TOKEN = process.env.TELE_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const HARGA_BOT = parseInt(process.env.HARGA_BOT) || 2000;
const PORT = process.env.PORT || 3000;
const MASA_AKTIF_HARI = parseInt(process.env.MASA_AKTIF_HARI) || 30;

if (!TELE_TOKEN || !ADMIN_ID) {
    console.error('❌ Environment variables tidak lengkap! Cek file .env');
    process.exit(1);
}

const app = express();
app.use(express.json());

// === WEBHOOK PAKASIR ===
app.post('/webhook/pakasir', async (req, res) => {
    try {
        const data = req.body;
        logInfo(`Pakasir webhook received: ${JSON.stringify(data)}`);

        if (data.status === 'success' || data.status === 'paid' || data.status === 'completed') {
            const users = getUsers();
            const user = users.find(u => u.pendingOrderId === data.order_id);

            if (user) {
                const expireDate = tambahHari(MASA_AKTIF_HARI);
                updateUser(user.nim, {
                    status: 'active',
                    activatedAt: new Date().toISOString(),
                    expireAt: expireDate,
                    pendingOrderId: null
                });

                await sendTele(
                    user.chatId,
                    `🎉 *Pembayaran Sukses!*\n\nMakasih ya! Akun kamu (NIM: ${user.nim}) udah resmi *AKTIF*.\n\n⏰ *Masa Aktif:* ${MASA_AKTIF_HARI} hari\n📅 *Berlaku Sampai:* ${new Date(expireDate).toLocaleDateString('id-ID')}\n\nSekarang kamu bisa duduk tenang, urusan absen biar bot yang handle.`
                );

                const uname = user.username || 'Tanpa Username';
                const notifAdmin = `💸 *CUAN MASUK BOS!* 💸\n\n👤 *Nama:* ${user.nama}\n🆔 *NIM:* ${user.nim}\n💬 *Tele:* ${uname}\n💳 *Status:* LUNAS (Pakasir)\n💰 *Amount:* Rp${data.amount || HARGA_BOT}\n⏰ *Masa Aktif:* ${MASA_AKTIF_HARI} hari\n\nSistem berhasil mengaktifkan pelanggan baru! 🚀`;
                await sendTele(ADMIN_ID, notifAdmin);

                logInfo(`User ${user.nim} activated via Pakasir payment`);
            }
        }

        res.status(200).json({ success: true });
    } catch (error) {
        logError('Pakasir webhook error', error);
        res.status(500).json({ success: false });
    }
});

// === WEBHOOK PAYMENKU (Legacy - dapat dihapus jika sudah tidak digunakan) ===
app.post('/webhook/paymenku', async (req, res) => {
    try {
        const data = req.body;
        logInfo(`Webhook received: ${JSON.stringify(data)}`);

        if (data.event === 'payment.status_updated' && (data.status === 'paid' || data.status === 'success')) {
            const user = getUserByNIM(data.reference_id);

            if (user) {
                const expireDate = tambahHari(MASA_AKTIF_HARI);
                updateUser(data.reference_id, {
                    status: 'active',
                    activatedAt: new Date().toISOString(),
                    expireAt: expireDate
                });

                await sendTele(
                    user.chatId,
                    `🎉 *Pembayaran Sukses!*\n\nMakasih ya! Akun kamu (NIM: ${data.reference_id}) udah resmi *AKTIF*.\n\n⏰ *Masa Aktif:* ${MASA_AKTIF_HARI} hari\n📅 *Berlaku Sampai:* ${new Date(expireDate).toLocaleDateString('id-ID')}\n\nSekarang kamu bisa duduk tenang, urusan absen biar bot yang handle.`
                );

                const uname = user.username || 'Tanpa Username';
                const notifAdmin = `💸 *CUAN MASUK BOS!* 💸\n\n👤 *Nama:* ${user.nama}\n🆔 *NIM:* ${data.reference_id}\n💬 *Tele:* ${uname}\n💳 *Status:* LUNAS (Paymenku)\n⏰ *Masa Aktif:* ${MASA_AKTIF_HARI} hari\n\nSistem berhasil mengaktifkan pelanggan baru! 🚀`;
                await sendTele(ADMIN_ID, notifAdmin);

                logInfo(`User ${data.reference_id} activated via payment`);
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        logError('Webhook error', error);
        res.status(500).send('Error');
    }
});

// === COMMAND HANDLERS ===
async function handleStart(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        const welcomeMsg = `🎓 *Selamat Datang di Spada Kare!*\n\nBot pintar yang bantu kamu absen otomatis di SPADA UNTAG Semarang.\n\n✨ *Fitur Unggulan:*\n• 🤖 Absen otomatis sesuai jadwal\n• 📊 Tracking history & statistik\n• 🔮 Prediksi kehadiran\n• 🏆 Achievement system\n• 📱 Interface yang user-friendly\n\n📝 *Cara Mulai:*\nKetik: \`/input NIM PASSWORD NAMA\`\n\nContoh:\n\`/input 12345678 password123 Budi Santoso\``;
        await sendTele(chatId, welcomeMsg);
    } else {
        const welcomeMsg = `👋 Halo lagi, *${user.nama}*!\n\nSenang ketemu lagi. Pilih menu di bawah untuk mulai:`;
        await sendTeleWithKeyboard(chatId, welcomeMsg, createMainKeyboard().reply_markup.inline_keyboard);
    }
}

async function handleInput(chatId, parts, username) {
    if (parts.length < 4) {
        return sendTele(chatId, "⚠️ Kayaknya formatnya kurang pas deh. Coba ketik gini:\n`/input NIM PASSWORD_SPADA NAMA_KAMU`");
    }

    const nim = parts[1];
    const pass = parts[2];
    const nama = parts.slice(3).join(' ');

    if (!validateNIM(nim)) {
        return sendTele(chatId, "❌ Format NIM tidak valid. NIM harus berupa angka 8-15 digit.");
    }

    if (!validatePassword(pass)) {
        return sendTele(chatId, "❌ Password harus minimal 4 karakter dan maksimal 50 karakter.");
    }

    const teleUsername = username ? `@${username}` : 'Tanpa Username';

    let users = getUsers();
    users = users.filter(u => u.chatId !== chatId);
    users.push({
        nim,
        pass,
        nama,
        chatId,
        status: 'inactive',
        username: teleUsername,
        createdAt: new Date().toISOString()
    });
    saveUsers(users);

    logInfo(`New user registered: ${nim} - ${nama}`);
    await sendTele(chatId, `✅ *Data Masuk!*\nHalo ${nama}, akunmu udah tersimpan di sistem. Tinggal beresin aktivasinya ya, ketik \`/bayar\`.`);
}

async function handleBayar(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Wah, kamu belum daftar nih. Ketik `/input` dulu ya.");
    }

    if (user.status === 'active') {
        const sisaHari = hitungSisaHari(user.expireAt);
        if (sisaHari > 0) {
            return sendTele(chatId, `✅ Eh, akun kamu kan udah *AKTIF*.\n\n⏰ Sisa masa aktif: *${sisaHari} hari*\n📅 Berlaku sampai: ${new Date(user.expireAt).toLocaleDateString('id-ID')}\n\nNggak usah bayar lagi! Tunggu aja jadwal kuliahnya.`);
        }
    }

    // Langsung proses pembayaran QRIS
    await handlePaymentMethod(chatId, 'qris');
}

async function handlePaymentMethod(chatId, method) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Wah, kamu belum daftar nih. Ketik `/input` dulu ya.");
    }

    const orderId = generateOrderId(user.nim);
    const result = await createPayment(orderId, HARGA_BOT, method);

    if (result.success) {
        updateUser(user.nim, { pendingOrderId: orderId });

        const payment = result.data.payment;

        let payMsg = `💸 *Invoice Pembayaran*\n\n`;
        payMsg += `📋 Order ID: \`${orderId}\`\n`;
        payMsg += `💵 Total: *Rp${HARGA_BOT}*\n`;
        payMsg += `⏰ Masa Aktif: ${MASA_AKTIF_HARI} hari\n\n`;
        payMsg += `📱 *Scan QR Code ini:*\n\n`;

        const expiredDate = new Date(payment.expired_at);
        payMsg += `⏳ Berlaku sampai: ${expiredDate.toLocaleString('id-ID')}\n\n`;
        payMsg += `_Sistem otomatis akan mengaktifkan bot setelah pembayaran berhasil._`;

        if (method === 'qris' && payment.payment_number) {
            await sendPhoto(chatId, `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payment.payment_number)}`, payMsg);
        } else {
            await sendTele(chatId, payMsg);
        }

        logInfo(`Payment created: ${orderId} - ${user.nim} - ${method}`);
    } else {
        logError(`Payment creation failed for ${user.nim}`, result.error);
        await sendTele(chatId, "⚠️ Duh, gateway pembayarannya lagi sibuk. Coba lagi nanti atau hubungi admin ya.");
    }
}

async function handleStatus(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Belum ada data yang terdaftar. Ketik `/input` dulu ya.");
    }

    const matkuls = getJadwalHariIni();
    let jadwalTeks = matkuls.length > 0
        ? matkuls.map(m => `• ${m.nama} (${m.jam})`).join('\n')
        : "Wah, hari ini kamu libur. Nggak ada jadwal!";

    let statusMark = '🔴 Belum Aktif';
    let infoTambahan = '';

    if (user.status === 'active') {
        const sisaHari = hitungSisaHari(user.expireAt);
        if (sisaHari > 0) {
            statusMark = '🟢 Aktif';
            infoTambahan = `\n⏰ *Sisa Masa Aktif:* ${sisaHari} hari\n📅 *Berlaku Sampai:* ${new Date(user.expireAt).toLocaleDateString('id-ID')}`;
        } else {
            statusMark = '🟠 Expired';
            infoTambahan = '\n⚠️ Masa aktif sudah habis. Ketik `/bayar` untuk perpanjang.';
            updateUser(user.nim, { status: 'expired' });
        }
    }

    // Get weekly stats
    const stats = getWeeklyStats(user.nim);
    let statsText = '';
    if (stats && stats.total > 0) {
        statsText = `\n\n📈 *Statistik Minggu Ini:*\n✅ Hadir: ${stats.hadir}x\n⏳ Belum Buka: ${stats.belumBuka}x\n📊 Rata-rata: ${stats.avgPersentase}%`;
    }

    // Show skip mode status
    let skipModeText = '';
    if (user.skipMode) {
        skipModeText = '\n\n🏖️ *Mode Libur:* AKTIF (Auto absen dinonaktifkan hari ini)';
    }

    const statusMsg = `📊 *Dashboard Personal*\n\n👤 Nama: ${user.nama}\n🆔 NIM: \`${user.nim}\`\n⚡ Status: ${statusMark}${infoTambahan}\n\n📅 *Jadwal Kamu Hari Ini:*\n${jadwalTeks}${statsText}${skipModeText}`;

    await sendTeleWithKeyboard(chatId, statusMsg, createMainKeyboard().reply_markup.inline_keyboard);
}

async function handleCek(chatId) {
    const user = getUserByChatId(chatId);

    if (!user || user.status !== 'active') {
        return sendTele(chatId, "❌ Akun kamu belum aktif nih. Ketik `/bayar` dulu yuk.");
    }

    const sisaHari = hitungSisaHari(user.expireAt);
    if (sisaHari <= 0) {
        updateUser(user.nim, { status: 'expired' });
        return sendTele(chatId, "⚠️ Masa aktif kamu sudah habis. Ketik `/bayar` untuk perpanjang.");
    }

    const matkuls = getJadwalHariIni();

    if (matkuls.length === 0) {
        return sendTele(chatId, "Santai, hari ini nggak ada jadwal kuliah.");
    }

    await sendTele(chatId, `🔍 Siap! Sistem lagi meluncur ke Spada buat ngecek apakah kamu udah absen hari ini, atau ngecek tombol kehadirannya udah dibuka dosen apa belum... Tunggu bentar ya!`);

    for (const m of matkuls) {
        const result = await prosesAbsen(user, m, true);
        if (result.message) {
            await sendTele(chatId, result.message);
        }
        await new Promise(r => setTimeout(r, 3000));
    }
}

async function handleSapuJagat(chatId) {
    const user = getUserByChatId(chatId);

    if (!user || user.status !== 'active') {
        return sendTele(chatId, "❌ Akun kamu belum aktif.");
    }

    const sisaHari = hitungSisaHari(user.expireAt);
    if (sisaHari <= 0) {
        updateUser(user.nim, { status: 'expired' });
        return sendTele(chatId, "⚠️ Masa aktif kamu sudah habis. Ketik `/bayar` untuk perpanjang.");
    }

    await sendTele(chatId, `🌪️ *Mode Sapu Jagat Aktif!*\nDosen ganti jadwal mendadak? Santai, aku lagi nge-scan SEMUA mata kuliahmu secara diam-diam buat nyari link absen hari ini...`);

    const matkulUnik = getAllMatkul();

    for (const m of matkulUnik) {
        const result = await prosesAbsen(user, m, false);
        if (result.status === 'success' && result.message) {
            await sendTele(chatId, result.message);
        }
        await new Promise(r => setTimeout(r, 3000));
    }

    await sendTele(chatId, `✅ Scan Sapu Jagat selesai! Kalau tadi nemu absen yang nyasar di hari ini, udah langsung aku sikat.`);
}

async function handleJadwal(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Belum ada data yang terdaftar. Ketik `/input` dulu ya.");
    }

    let jadwalMsg = "📅 *Jadwal Kuliah Lengkap*\n\n";

    const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    for (let i = 1; i <= 5; i++) {
        const matkuls = JADWAL_KULIAH[i] || [];
        if (matkuls.length > 0) {
            jadwalMsg += `*${hari[i]}:*\n`;
            matkuls.forEach(m => {
                jadwalMsg += `• ${m.jam} - ${m.nama}\n`;
            });
            jadwalMsg += '\n';
        }
    }

    await sendTeleWithKeyboard(chatId, jadwalMsg, createMainKeyboard().reply_markup.inline_keyboard);
}

async function handleHistory(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Belum ada data yang terdaftar. Ketik `/input` dulu ya.");
    }

    const history = getAttendanceHistory(user.nim, 10);

    if (history.length === 0) {
        return sendTele(chatId, "📊 Belum ada riwayat absensi.");
    }

    let historyMsg = "📈 *Riwayat Absensi Terakhir*\n\n";

    history.forEach((h, i) => {
        let statusIcon = '✅';
        if (h.status === 'NOT_OPEN') statusIcon = '⏳';
        else if (h.status === 'ERROR') statusIcon = '❌';

        historyMsg += `${i + 1}. ${statusIcon} *${h.matkul}*\n`;
        historyMsg += `   📅 ${h.date}\n`;
        historyMsg += `   📊 ${h.persentase}\n\n`;
    });

    await sendTeleWithKeyboard(chatId, historyMsg, createMainKeyboard().reply_markup.inline_keyboard);
}

async function handlePredict(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Belum ada data yang terdaftar. Ketik `/input` dulu ya.");
    }

    const stats = getWeeklyStats(user.nim);

    if (!stats || stats.total === 0) {
        return sendTele(chatId, "🔮 Belum cukup data untuk prediksi. Tunggu beberapa hari lagi ya!");
    }

    let predictMsg = "🔮 *Prediksi Kehadiran*\n\n";
    predictMsg += `📊 *Data Minggu Ini:*\n`;
    predictMsg += `✅ Hadir: ${stats.hadir}x\n`;
    predictMsg += `⏳ Belum Buka: ${stats.belumBuka}x\n`;
    predictMsg += `📈 Rata-rata: ${stats.avgPersentase}%\n\n`;

    if (stats.best) {
        predictMsg += `🏆 *Terbaik:* ${stats.best.nama} (${stats.best.persentase}%)\n`;
    }

    if (stats.worst) {
        predictMsg += `⚠️ *Perlu Perhatian:* ${stats.worst.nama} (${stats.worst.persentase}%)\n\n`;
    }

    // Simple prediction
    if (parseFloat(stats.avgPersentase) >= 80) {
        predictMsg += "✨ *Prediksi:* Kamu on track! Pertahankan kehadiran ini sampai akhir semester.";
    } else if (parseFloat(stats.avgPersentase) >= 60) {
        predictMsg += "⚠️ *Prediksi:* Hati-hati, persentase kamu di zona aman tapi jangan sampai bolos lagi ya!";
    } else {
        predictMsg += "🚨 *Prediksi:* Waspada! Persentase kamu rendah, usahakan hadir terus dari sekarang.";
    }

    await sendTeleWithKeyboard(chatId, predictMsg, createMainKeyboard().reply_markup.inline_keyboard);
}

async function handleHelp(chatId) {
    const helpMsg = `ℹ️ *Panduan Spada Kare Bot*

*Perintah Utama:*
• \`/start\` - Mulai bot
• \`/input NIM PASS NAMA\` - Daftar akun
• \`/bayar\` - Aktivasi/perpanjang
• \`/status\` - Cek status akun
• \`/cek\` - Cek absen hari ini
• \`/sapujagat\` - Scan semua matkul
• \`/libur\` - Nonaktifkan auto absen hari ini
• \`/masuk\` - Aktifkan kembali auto absen

*Fitur Tombol:*
• 📊 Status - Info akun & jadwal
• ✅ Cek Absen - Cek absen manual
• 📅 Jadwal - Lihat jadwal lengkap
• 📈 History - Riwayat absensi
• 🔮 Prediksi - Analisis kehadiran
• 🌪️ Sapu Jagat - Scan semua matkul
• 💰 Bayar - Aktivasi akun
• ℹ️ Help - Panduan ini

*Fitur Otomatis:*
Bot akan otomatis absen sesuai jadwal kuliah kamu setiap hari.

*Tips Penting:*
Kalau kamu nggak berangkat kuliah, ketik \`/libur\` supaya bot nggak auto absen hari ini. Besok otomatis aktif lagi.

*Butuh Bantuan?*
Hubungi admin jika ada kendala.`;

    await sendTeleWithKeyboard(chatId, helpMsg, createMainKeyboard().reply_markup.inline_keyboard);
}

async function handleLibur(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Belum ada data yang terdaftar. Ketik `/input` dulu ya.");
    }

    if (user.status !== 'active') {
        return sendTele(chatId, "❌ Akun kamu belum aktif nih. Ketik `/bayar` dulu yuk.");
    }

    if (user.skipMode) {
        return sendTele(chatId, "ℹ️ Mode libur sudah aktif kok. Auto absen hari ini sudah dinonaktifkan.");
    }

    updateUser(user.nim, {
        skipMode: true,
        skipModeDate: new Date().toISOString()
    });

    await sendTele(chatId, `🏖️ *Mode Libur Aktif!*\n\nOke, aku nggak akan auto absen kamu hari ini. Kamu tetap bisa pakai \`/cek\` atau \`/sapujagat\` kalau mau absen manual.\n\n✅ Besok otomatis aktif lagi, atau ketik \`/masuk\` kalau mau aktifkan sekarang.`);
    logInfo(`User ${user.nim} activated skip mode`);
}

async function handleMasuk(chatId) {
    const user = getUserByChatId(chatId);

    if (!user) {
        return sendTele(chatId, "❌ Belum ada data yang terdaftar. Ketik `/input` dulu ya.");
    }

    if (!user.skipMode) {
        return sendTele(chatId, "ℹ️ Auto absen kamu sudah aktif kok. Nggak perlu diaktifkan lagi.");
    }

    updateUser(user.nim, {
        skipMode: false,
        skipModeDate: null
    });

    await sendTele(chatId, `✅ *Auto Absen Aktif Kembali!*\n\nOke, mode libur dimatikan. Bot akan kembali auto absen sesuai jadwal kuliah kamu.`);
    logInfo(`User ${user.nim} deactivated skip mode`);
}

// === ADMIN COMMANDS ===
async function handleAdminList(chatId) {
    const users = getUsers();
    let laporan = "📋 *DAFTAR PELANGGAN TOKO KARE:*\n\n";

    users.forEach((u, i) => {
        const uname = u.username || 'Tanpa Username';
        let statusIcon = '🔴';
        let statusText = 'Inactive';

        if (u.status === 'active') {
            const sisaHari = hitungSisaHari(u.expireAt);
            if (sisaHari > 0) {
                statusIcon = '🟢';
                statusText = `Aktif (${sisaHari}h)`;
            } else {
                statusIcon = '🟠';
                statusText = 'Expired';
            }
        }

        laporan += `${i + 1}. ${statusIcon} ${u.nama} (\`${u.nim}\`) | ${uname} | ${statusText}\n`;
    });

    await sendTele(chatId, laporan || "Belum ada pelanggan nih bos.");
}

async function handleAdminCek(chatId, targetNim) {
    const targetUser = getUserByNIM(targetNim);

    if (!targetUser) {
        return sendTele(chatId, `❌ Waduh, NIM ${targetNim} nggak ketemu di database, Bos.`);
    }

    await sendTele(chatId, `🔍 Bos Admin lagi inspeksi absen buat:\n👤 ${targetUser.nama} (${targetUser.username})\nNIM: ${targetUser.nim}...`);

    const matkuls = getJadwalHariIni();
    for (const m of matkuls) {
        const result = await prosesAbsen(targetUser, m, true);
        if (result.message) {
            await sendTele(chatId, result.message);
        }
        await new Promise(r => setTimeout(r, 3000));
    }
}

async function handleAdminAcc(chatId, nim) {
    const user = getUserByNIM(nim);

    if (!user) {
        return sendTele(chatId, `❌ NIM ${nim} tidak ditemukan di database.`);
    }

    const expireDate = tambahHari(MASA_AKTIF_HARI);
    updateUser(nim, {
        status: 'active',
        activatedAt: new Date().toISOString(),
        expireAt: expireDate
    });

    await sendTele(
        user.chatId,
        `✅ *Aktivasi Manual Berhasil!*\n\nAkun kamu sudah diaktifkan secara manual oleh Admin.\n\n⏰ *Masa Aktif:* ${MASA_AKTIF_HARI} hari\n📅 *Berlaku Sampai:* ${new Date(expireDate).toLocaleDateString('id-ID')}\n\nProses absen otomatis kini berjalan.`
    );

    await sendTele(chatId, `✅ Berhasil mengaktifkan NIM ${nim} secara manual.\n⏰ Masa aktif: ${MASA_AKTIF_HARI} hari`);
    logInfo(`Admin manually activated ${nim}`);
}

async function handleAdminAddManual(chatId, parts) {
    if (parts.length < 4) {
        return sendTele(chatId, "❌ Format salah Bos. Pakai: `/addmanual NIM PASS NAMA`");
    }

    const nim = parts[1];
    const pass = parts[2];
    const nama = parts.slice(3).join(' ');

    if (getUserByNIM(nim)) {
        return sendTele(chatId, "⚠️ NIM ini udah ada di database, Bos!");
    }

    let users = getUsers();
    const expireDate = tambahHari(MASA_AKTIF_HARI);

    users.push({
        nim,
        pass,
        nama,
        chatId: ADMIN_ID,
        status: 'active',
        username: 'Offline/WA (Manual)',
        createdAt: new Date().toISOString(),
        activatedAt: new Date().toISOString(),
        expireAt: expireDate
    });

    saveUsers(users);

    await sendTele(
        chatId,
        `✅ *Akun Titipan Sukses!*\n\nData ${nama} (${nim}) udah masuk dan berstatus 🟢 AKTIF.\n⏰ Masa aktif: ${MASA_AKTIF_HARI} hari\n📅 Berlaku sampai: ${new Date(expireDate).toLocaleDateString('id-ID')}\n\nNanti laporannya bakal masuk ke sini buat Bos SS ke WA dia.`
    );

    logInfo(`Admin added manual user: ${nim} - ${nama}`);
}

async function handleAdminDeactivate(chatId, nim) {
    const user = getUserByNIM(nim);

    if (!user) {
        return sendTele(chatId, `❌ NIM ${nim} tidak ditemukan di database.`);
    }

    if (user.status === 'inactive' || user.status === 'expired') {
        return sendTele(chatId, `⚠️ NIM ${nim} (${user.nama}) sudah dalam status non-aktif.`);
    }

    updateUser(nim, {
        status: 'inactive',
        deactivatedAt: new Date().toISOString()
    });

    await sendTele(
        user.chatId,
        `🔴 *Akun Dinonaktifkan*\n\nHai ${user.nama}, akun kamu telah dinonaktifkan oleh Admin.\n\nJika ada pertanyaan, silakan hubungi admin.`
    );

    await sendTele(chatId, `✅ Berhasil menonaktifkan NIM ${nim} (${user.nama}).\n🔴 Status: INACTIVE`);
    logInfo(`Admin deactivated ${nim}`);
}

async function handleAdminLibur(chatId, nim) {
    const user = getUserByNIM(nim);

    if (!user) {
        return sendTele(chatId, `❌ NIM ${nim} tidak ditemukan di database.`);
    }

    if (user.skipMode) {
        return sendTele(chatId, `ℹ️ NIM ${nim} (${user.nama}) sudah dalam mode libur.`);
    }

    updateUser(nim, {
        skipMode: true,
        skipModeDate: new Date().toISOString()
    });

    await sendTele(
        user.chatId,
        `🏖️ *Mode Libur Diaktifkan oleh Admin*\n\nHai ${user.nama}! Admin telah mengaktifkan mode libur untuk kamu.\n\nAuto absen hari ini dinonaktifkan. Besok otomatis aktif lagi, atau ketik \`/masuk\` kalau mau aktifkan sekarang.`
    );

    await sendTele(chatId, `✅ Berhasil mengaktifkan mode libur untuk NIM ${nim} (${user.nama}).\n🏖️ Auto absen dinonaktifkan.`);
    logInfo(`Admin activated skip mode for ${nim}`);
}

async function handleAdminMasuk(chatId, nim) {
    const user = getUserByNIM(nim);

    if (!user) {
        return sendTele(chatId, `❌ NIM ${nim} tidak ditemukan di database.`);
    }

    if (!user.skipMode) {
        return sendTele(chatId, `ℹ️ NIM ${nim} (${user.nama}) sudah tidak dalam mode libur.`);
    }

    updateUser(nim, { skipMode: false });

    await sendTele(
        user.chatId,
        `✅ *Mode Libur Dinonaktifkan oleh Admin*\n\nHai ${user.nama}! Admin telah menonaktifkan mode libur untuk kamu.\n\nAuto absen akan jalan seperti biasa.`
    );

    await sendTele(chatId, `✅ Berhasil menonaktifkan mode libur untuk NIM ${nim} (${user.nama}).\n✅ Auto absen aktif kembali.`);
    logInfo(`Admin deactivated skip mode for ${nim}`);
}

async function handleAdminHelp(chatId) {
    const helpMsg = `🔧 *ADMIN COMMANDS*

*Manajemen User:*
• \`/list\` - Lihat semua user terdaftar
• \`/cek NIM\` - Cek detail user by NIM
• \`/acc NIM\` - Aktivasi user pending
• \`/deactivate NIM\` - Nonaktifkan user

*Tambah User Manual:*
• \`/addmanual NIM NAMA PASS\`
  Contoh: \`/addmanual 123456 Budi pass123\`

*Kontrol Mode Libur:*
• \`/adminlibur NIM\` - Aktifkan mode libur user
• \`/adminmasuk NIM\` - Nonaktifkan mode libur user

*Info:*
• \`/adminhelp\` - Panduan ini`;

    await sendTele(chatId, helpMsg);
}

// === BOT POLLING ===
let lastUpdateId = 0;

async function handleCommands() {
    try {
        const updates = await getUpdates(lastUpdateId + 1);

        for (const update of updates) {
            lastUpdateId = update.update_id;

            // Handle callback queries (button clicks)
            if (update.callback_query) {
                const callbackQuery = update.callback_query;
                const chatId = callbackQuery.message.chat.id.toString();
                const callbackData = callbackQuery.data;

                await answerCallback(callbackQuery.id);

                if (callbackData === 'cmd_status') {
                    await handleStatus(chatId);
                } else if (callbackData === 'cmd_cek') {
                    await handleCek(chatId);
                } else if (callbackData === 'cmd_bayar') {
                    await handleBayar(chatId);
                } else if (callbackData === 'cmd_sapujagat') {
                    await handleSapuJagat(chatId);
                } else if (callbackData === 'cmd_jadwal') {
                    await handleJadwal(chatId);
                } else if (callbackData === 'cmd_history') {
                    await handleHistory(chatId);
                } else if (callbackData === 'cmd_predict') {
                    await handlePredict(chatId);
                } else if (callbackData === 'cmd_help') {
                    await handleHelp(chatId);
                }

                continue;
            }

            // Handle text messages
            if (!update.message || !update.message.text) continue;

            const chatId = update.message.chat.id.toString();
            const text = update.message.text.trim();
            const username = update.message.from.username;
            const command = text.split(' ')[0];

            if (!checkCooldown(chatId, command)) {
                continue;
            }

            const parts = text.split(' ');

            // User commands
            if (text === '/start') {
                await handleStart(chatId);
            } else if (text.startsWith('/input')) {
                await handleInput(chatId, parts, username);
            } else if (text === '/bayar') {
                await handleBayar(chatId);
            } else if (text === '/status') {
                await handleStatus(chatId);
            } else if (text === '/cek') {
                await handleCek(chatId);
            } else if (text === '/sapujagat') {
                await handleSapuJagat(chatId);
            } else if (text === '/libur') {
                await handleLibur(chatId);
            } else if (text === '/masuk') {
                await handleMasuk(chatId);
            } else if (text === '/jadwal') {
                await handleJadwal(chatId);
            } else if (text === '/history') {
                await handleHistory(chatId);
            } else if (text === '/predict') {
                await handlePredict(chatId);
            } else if (text === '/help') {
                await handleHelp(chatId);
            }
            // Admin commands
            else if (chatId === ADMIN_ID) {
                if (text === '/list') {
                    await handleAdminList(chatId);
                } else if (text === '/adminhelp') {
                    await handleAdminHelp(chatId);
                } else if (text.startsWith('/cek ')) {
                    await handleAdminCek(chatId, parts[1]);
                } else if (text.startsWith('/acc ')) {
                    await handleAdminAcc(chatId, parts[1]);
                } else if (text.startsWith('/addmanual ')) {
                    await handleAdminAddManual(chatId, parts);
                } else if (text.startsWith('/deactivate ')) {
                    await handleAdminDeactivate(chatId, parts[1]);
                } else if (text.startsWith('/adminlibur ')) {
                    await handleAdminLibur(chatId, parts[1]);
                } else if (text.startsWith('/adminmasuk ')) {
                    await handleAdminMasuk(chatId, parts[1]);
                }
            }
        }
    } catch (error) {
        logError('Command handling error', error);
    }
}

// === AUTO ABSEN SCHEDULER ===
cron.schedule('*/5 * * * *', async () => {
    try {
        logInfo('Running auto attendance check...');

        const now = new Date();
        const hari = now.getDay();
        const matkuls = getJadwalHariIni();

        if (matkuls.length === 0) return;

        const aktif = getUsers().filter(u => {
            if (u.status !== 'active') return false;
            const sisaHari = hitungSisaHari(u.expireAt);
            if (sisaHari <= 0) {
                updateUser(u.nim, { status: 'expired' });
                return false;
            }
            // Skip user yang aktifkan mode libur
            if (u.skipMode) {
                return false;
            }
            return true;
        });

        for (const m of matkuls) {
            const [jam, mnt] = m.jam.split(':');
            const target = new Date();
            target.setHours(parseInt(jam), parseInt(mnt), 0);
            const diff = (now - target) / (1000 * 60);

            if (diff >= -5 && diff <= 60) {
                for (const u of aktif) {
                    const result = await prosesAbsen(u, m, false, true);
                    // Kirim notif jika berhasil absen otomatis
                    if (result.status === 'success' && result.message) {
                        await sendTele(u.chatId, result.message);
                    }
                    // Delay 3 detik antar user untuk menghindari rate limit
                    await new Promise(r => setTimeout(r, 3000));
                }
                // Delay 2 detik antar matkul untuk menghindari spam login
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        logInfo('Auto attendance check completed');
    } catch (error) {
        logError('Auto attendance error', error);
    }
});

// === EXPIRY REMINDER ===
cron.schedule('0 9 * * *', async () => {
    try {
        logInfo('Running expiry reminder check...');

        const users = getUsers().filter(u => u.status === 'active');

        for (const user of users) {
            const sisaHari = hitungSisaHari(user.expireAt);

            if (sisaHari === 3) {
                await sendTele(
                    user.chatId,
                    `⚠️ *Reminder Masa Aktif*\n\nHai ${user.nama}! Masa aktif bot kamu tinggal *3 hari* lagi.\n\n📅 Berlaku sampai: ${new Date(user.expireAt).toLocaleDateString('id-ID')}\n\nJangan lupa perpanjang ya, ketik \`/bayar\` untuk perpanjang.`
                );
            } else if (sisaHari <= 0) {
                updateUser(user.nim, { status: 'expired' });
                await sendTele(
                    user.chatId,
                    `🔴 *Masa Aktif Habis*\n\nHai ${user.nama}, masa aktif bot kamu sudah habis.\n\nKetik \`/bayar\` untuk aktivasi kembali.`
                );
            }
        }

        logInfo('Expiry reminder check completed');
    } catch (error) {
        logError('Expiry reminder error', error);
    }
});

// === AUTO RESET SKIP MODE ===
cron.schedule('0 0 * * *', async () => {
    try {
        logInfo('Running skip mode reset...');

        const users = getUsers().filter(u => u.skipMode === true);

        for (const user of users) {
            updateUser(user.nim, {
                skipMode: false,
                skipModeDate: null
            });
            logInfo(`Auto-reset skip mode for ${user.nim}`);
        }

        logInfo(`Skip mode reset completed for ${users.length} users`);
    } catch (error) {
        logError('Skip mode reset error', error);
    }
});

// === START SERVER ===
async function main() {
    app.listen(PORT, () => {
        logInfo(`🚀 Server Bot Berjalan di Port ${PORT}`);
        console.log(`🚀 Server Bot Berjalan di Port ${PORT}`);
        console.log(`⏰ Masa Aktif Default: ${MASA_AKTIF_HARI} hari`);
    });

    // Start polling
    while (true) {
        await handleCommands();
        await new Promise(r => setTimeout(r, 1000));
    }
}

main().catch(error => {
    logError('Fatal error', error);
    process.exit(1);
});
