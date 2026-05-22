import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { logError, logAbsensi, saveAttendanceHistory, checkAndAwardAchievements } from './database.js';
import { requestQueue } from './queue.js';
import { safeguard } from './safeguard.js';
import { sendTele } from './telegram.js';

// === SESSION CACHE ===
// Simpan session (cookie jar) per user agar tidak login ulang setiap request
const sessionCache = new Map(); // key: nim, value: { jar, lastUsed, userAgent }
const SESSION_TTL = 25 * 60 * 1000; // 25 menit session valid
const ADMIN_BAN_NOTICE_COOLDOWN = 30 * 60 * 1000;
let lastAdminBanNoticeAt = 0;

async function notifyAdminBanDetected(mhs, matkul, error, safeguardStatus) {
    const adminId = process.env.ADMIN_ID;
    if (!adminId) return;

    const now = Date.now();
    if (now - lastAdminBanNoticeAt < ADMIN_BAN_NOTICE_COOLDOWN) return;
    lastAdminBanNoticeAt = now;

    const reason = error.response?.status
        ? `HTTP ${error.response.status}`
        : error.code || error.message || 'Unknown error';

    await sendTele(
        adminId,
        `🚨 *Peringatan VPS/IP SPADA*\n\n` +
        `Safeguard mendeteksi kemungkinan VPS/IP diblokir atau dibatasi oleh SPADA.\n\n` +
        `👤 *NIM terakhir:* ${mhs.nim}\n` +
        `📖 *Matkul:* ${matkul.nama}\n` +
        `⚠️ *Penyebab:* ${reason}\n` +
        `⏸️ *Pause:* ${safeguardStatus.pauseRemaining}\n` +
        `📊 *Ban indicator:* ${safeguardStatus.banIndicators}\n` +
        `📈 *Request harian:* ${safeguardStatus.dailyRequests}\n\n` +
        `Sistem auto-pause. Sebaiknya jangan restart paksa sampai pause selesai.`
    );
}

function getOrCreateSession(nim) {
    const now = Date.now();
    if (sessionCache.has(nim)) {
        const session = sessionCache.get(nim);
        if (now - session.lastUsed < SESSION_TTL) {
            session.lastUsed = now;
            return { jar: session.jar, userAgent: session.userAgent, isNew: false };
        }
        // Session expired, hapus
        sessionCache.delete(nim);
    }
    // Buat session baru
    const jar = new CookieJar();
    const userAgent = getRandomUA();
    sessionCache.set(nim, { jar, userAgent, lastUsed: now });
    return { jar, userAgent, isNew: true };
}

function invalidateSession(nim) {
    sessionCache.delete(nim);
}

// Bersihkan session expired secara periodik
setInterval(() => {
    const now = Date.now();
    for (const [nim, session] of sessionCache.entries()) {
        if (now - session.lastUsed > SESSION_TTL) {
            sessionCache.delete(nim);
        }
    }
}, 5 * 60 * 1000); // Cek setiap 5 menit

// === USER AGENT & HEADERS ===
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

function getRandomUA() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const acceptLanguages = [
    'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'id-ID,id;q=0.9,en;q=0.8',
    'id,en-US;q=0.9,en;q=0.8',
    'id-ID,id;q=0.8,en-US;q=0.7,en;q=0.6'
];

export async function prosesAbsen(mhs, matkul, forceNotif = false, retryCount = 0) {
    // === SAFEGUARD CHECKS ===
    // 1. Cek apakah sistem sedang pause (backoff/ban detected)
    if (safeguard.isPausedNow()) {
        if (forceNotif) {
            return {
                success: false,
                message: `⏸️ Sistem sedang istirahat sebentar untuk keamanan. Coba lagi nanti ya.`,
                status: 'paused'
            };
        }
        return { success: false, status: 'paused' };
    }

    // 2. Cek daily request cap
    if (!safeguard.canMakeRequest()) {
        if (forceNotif) {
            return {
                success: false,
                message: `📊 Batas harian tercapai. Sistem akan aktif lagi besok pagi.`,
                status: 'daily_limit'
            };
        }
        return { success: false, status: 'daily_limit' };
    }

    // 3. Cek attendance cache - skip jika sudah hadir hari ini
    if (safeguard.isAlreadyPresent(mhs.nim, matkul.id)) {
        if (forceNotif) {
            return {
                success: true,
                message: `✅ Kamu sudah tercatat *HADIR* untuk *${matkul.nama}* hari ini.`,
                status: 'cached_present'
            };
        }
        return { success: true, status: 'cached_present' };
    }

    return requestQueue.add(async () => {
        safeguard.incrementRequest();
        return await _prosesAbsenInternal(mhs, matkul, forceNotif, retryCount);
    });
}

async function _prosesAbsenInternal(mhs, matkul, forceNotif = false, retryCount = 0) {
    // Gunakan session cache - hindari login berulang
    const session = getOrCreateSession(mhs.nim);
    const randomUA = session.userAgent;
    const randomLang = acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)];

    const clientConfig = {
        jar: session.jar,
        withCredentials: true,
        timeout: 60000,
        maxRedirects: 5,
        headers: {
            'User-Agent': randomUA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': randomLang,
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'DNT': '1'
        }
    };

    const client = wrapper(axios.create(clientConfig));

    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const namaBulan = months[d.getMonth()];
    const tahun = d.getFullYear();

    const tglHariIni = `${d.getDate()} ${namaBulan} ${tahun}`;
    const bulanIniString = `${namaBulan} ${tahun}`;

    try {
        // Jika session baru, lakukan login. Jika reuse session, skip login.
        if (session.isNew) {
            // Random delay sebelum login (8-15 detik) - lebih lama untuk meniru manusia
            const randomDelay = Math.floor(Math.random() * 7000) + 8000;
            console.log(`[SPADA] Waiting ${Math.ceil(randomDelay / 1000)}s before login (new session)...`);
            await new Promise(resolve => setTimeout(resolve, randomDelay));

            const loginPage = await client.get('https://spada.untagsmg.ac.id/login/index.php');
            const token = cheerio.load(loginPage.data)('input[name="logintoken"]').val();

            if (!token) {
                throw new Error('Login token tidak ditemukan di halaman login');
            }

            // Delay setelah get login page sebelum post login (6-10 detik)
            await new Promise(resolve => setTimeout(resolve, 6000 + Math.floor(Math.random() * 4000)));

            await client.post('https://spada.untagsmg.ac.id/login/index.php', new URLSearchParams({
                username: mhs.nim,
                password: mhs.pass,
                logintoken: token
            }));

            // Delay setelah login sebelum akses halaman attendance (8-12 detik)
            await new Promise(resolve => setTimeout(resolve, 8000 + Math.floor(Math.random() * 4000)));
        } else {
            // Reuse session - hanya delay pendek (3-5 detik) seperti user navigasi biasa
            console.log(`[SPADA] Reusing session for ${mhs.nim}`);
            await new Promise(resolve => setTimeout(resolve, 3000 + Math.floor(Math.random() * 2000)));
        }

        const page = await client.get(`https://spada.untagsmg.ac.id/mod/attendance/view.php?id=${matkul.id}`);
        const $ = cheerio.load(page.data);
        const pageText = $.text();

        // Check if session expired (redirected to login page)
        if (pageText.includes('logintoken') || pageText.includes('Log in to the site') || 
            pageText.includes('Masuk ke situs')) {
            // Session expired, invalidate dan retry dengan login baru
            if (!session.isNew) {
                console.log(`[SPADA] Session expired for ${mhs.nim}, re-login...`);
                invalidateSession(mhs.nim);
                if (retryCount === 0) {
                    return _prosesAbsenInternal(mhs, matkul, forceNotif, 1);
                }
            }
            throw new Error('Login gagal - session expired');
        }

        // Check if login was successful
        if (pageText.includes('Invalid login') || pageText.includes('Login gagal')) {
            invalidateSession(mhs.nim);
            throw new Error('Login gagal - NIM atau password salah');
        }

        let persentase = "0%";
        const matchPersen = pageText.match(/Persentase dari sesi yang diambil:\s*([\d,.]+%)|Percentage over taken sessions:\s*([\d,.]+%)/i);
        if (matchPersen) persentase = matchPersen[1] || matchPersen[2];

        let linkAbsen = null;
        let sudahAbsenBenaran = false;
        let hitungHadirBulanIni = 0;

        $('tr').each((i, el) => {
            const barisText = $(el).text();

            if (barisText.includes(bulanIniString)) {
                const kolomStatus = $(el).find('td.statuscol').text().trim().toUpperCase();
                if (kolomStatus === 'HADIR' || kolomStatus === 'PRESENT') {
                    hitungHadirBulanIni++;
                }
            }

            if (barisText.includes(tglHariIni)) {
                const kolomStatusHariIni = $(el).find('td.statuscol').text().trim().toUpperCase();
                if (kolomStatusHariIni === 'HADIR' || kolomStatusHariIni === 'PRESENT') {
                    sudahAbsenBenaran = true;
                } else {
                    const findLink = $(el).find('a[href*="attendance.php"]').attr('href');
                    if (findLink) linkAbsen = findLink;
                }
            }
        });

        const buatLaporan = (pesanUtama, totalHadir) => {
            return `${pesanUtama}\n\n👤 *NIM:* ${mhs.nim}\n📖 *Matkul:* _${matkul.nama}_\n📅 *Tanggal:* ${tglHariIni}\n📊 *Hadir Bulan Ini:* ${totalHadir} kali\n📈 *Persentase:* ${persentase}`;
        };

        if (sudahAbsenBenaran) {
            logAbsensi(mhs.nim, matkul.nama, 'SUDAH_HADIR', persentase);
            safeguard.reportSuccess();
            safeguard.markAsPresent(mhs.nim, matkul.id);
            // Selalu kirim notif untuk status sudah hadir
            return {
                success: true,
                message: buatLaporan(`✅ Aman terkendali! Status kamu udah *HADIR* hari ini.`, hitungHadirBulanIni),
                status: 'already_present'
            };
        }

        if (linkAbsen) {
            // Delay sebelum klik link absen (5-8 detik)
            await new Promise(resolve => setTimeout(resolve, 5000 + Math.floor(Math.random() * 3000)));

            const fPage = await client.get(linkAbsen);
            const $f = cheerio.load(fPage.data);
            const sesskey = $f('input[name="sesskey"]').val();
            let statusId = null;

            $f('input[type="radio"][name="status"]').each((i, el) => {
                const label = $f(el).parent().text().toLowerCase();
                if (label.trim() === 'hadir' || label.trim() === 'present') {
                    statusId = $f(el).val();
                }
            });

            if (sesskey && statusId) {
                // Delay sebelum submit form (4-7 detik) - meniru user baca form
                await new Promise(resolve => setTimeout(resolve, 4000 + Math.floor(Math.random() * 3000)));

                const sessid = linkAbsen.match(/sessid=(\d+)/)[1];
                await client.post(
                    `https://spada.untagsmg.ac.id/mod/attendance/attendance.php?sessid=${sessid}`,
                    new URLSearchParams({
                        sesskey,
                        status: statusId,
                        submitbutton: 'Simpan kehadiran',
                        _qf__mod_attendance_student_attendance_form: '1'
                    })
                );

                logAbsensi(mhs.nim, matkul.nama, 'BERHASIL_ABSEN', persentase);
                safeguard.reportSuccess();
                safeguard.markAsPresent(mhs.nim, matkul.id);

                // Selalu kirim notif jika berhasil absen
                return {
                    success: true,
                    message: buatLaporan(`🚀 *Sip, udah beres!*\nAku baru aja bantu klik absen *HADIR*.`, hitungHadirBulanIni + 1),
                    status: 'success'
                };
            }
        } else if (forceNotif) {
            return {
                success: true,
                message: buatLaporan(`⏳ Hmm, dosen belum buka tombol absen nih. Coba cek lagi nanti ya!`, hitungHadirBulanIni),
                status: 'not_open'
            };
        }

        return { success: true, status: 'not_open' };

    } catch (error) {
        const errorMsg = error.code === 'ETIMEDOUT'
            ? `Timeout saat akses Spada (${error.message})`
            : error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET'
                ? `Connection failed (${error.code})`
                : error.response?.status
                    ? `HTTP ${error.response.status}: ${error.response.statusText}`
                    : error.message || 'Unknown error';

        logError(`Error proses absen ${mhs.nim} - ${matkul.nama}: ${errorMsg}`, error);

        // Report error ke safeguard (auto-backoff & ban detection)
        const safeguardAction = safeguard.reportError(error.response?.status, error.code);

        // Invalidate session on auth errors
        if (error.response?.status === 401 || error.response?.status === 403 ||
            error.message?.includes('Login gagal')) {
            invalidateSession(mhs.nim);
        }

        // Jika safeguard bilang ban detected, jangan retry - langsung stop
        if (safeguardAction === 'ban_detected') {
            await notifyAdminBanDetected(mhs, matkul, error, safeguard.getStatus());

            if (forceNotif) {
                return {
                    success: false,
                    message: `🛑 Sistem mendeteksi kemungkinan blokir IP. Auto-pause aktif, akan coba lagi nanti.`,
                    status: 'ban_detected'
                };
            }
            return { success: false, status: 'ban_detected' };
        }

        // Retry once on timeout/connection error with longer delay
        if ((error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') && retryCount === 0) {
            logError(`Retrying attendance for ${mhs.nim} - ${matkul.nama}`, new Error(`First attempt failed: ${error.code}`));
            invalidateSession(mhs.nim); // Force new session on retry
            await new Promise(resolve => setTimeout(resolve, 10000 + Math.floor(Math.random() * 5000))); // 10-15s before retry
            return _prosesAbsenInternal(mhs, matkul, forceNotif, 1);
        }

        if (forceNotif) {
            let userMessage = `❌ Aduh, koneksi ke Spada lagi macet pas buka *${matkul.nama}*.`;

            if (error.code === 'ETIMEDOUT') {
                userMessage = `⏱️ Timeout pas akses *${matkul.nama}*. Server Spada lagi lambat nih.`;
            } else if (error.message?.includes('Login gagal') || error.message?.includes('NIM atau password')) {
                userMessage = `🔐 Login gagal untuk *${matkul.nama}*. Coba cek NIM/password kamu dengan /setting ya.`;
            } else if (error.message?.includes('Login token tidak ditemukan')) {
                userMessage = `🔧 Halaman login Spada berubah. Hubungi admin untuk update bot.`;
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                userMessage = `🔐 Login gagal untuk *${matkul.nama}*. Coba cek NIM/password kamu ya.`;
            } else if (error.response?.status >= 500) {
                userMessage = `🔧 Server Spada lagi error (${error.response.status}) pas buka *${matkul.nama}*.`;
            }

            return {
                success: false,
                message: `${userMessage}\n\nSantai, nanti dicoba lagi.`,
                status: 'error'
            };
        }
        return { success: false, status: 'error' };
    }
}
