import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { logError, logAbsensi, saveAttendanceHistory, checkAndAwardAchievements } from './database.js';
import { requestQueue } from './queue.js';

export async function prosesAbsen(mhs, matkul, forceNotif = false, retryCount = 0) {
    return requestQueue.add(async () => {
        return await _prosesAbsenInternal(mhs, matkul, forceNotif, retryCount);
    });
}

async function _prosesAbsenInternal(mhs, matkul, forceNotif = false, retryCount = 0) {
    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        timeout: 45000, // Increased from 30s to 45s
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }));

    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const namaBulan = months[d.getMonth()];
    const tahun = d.getFullYear();

    const tglHariIni = `${d.getDate()} ${namaBulan} ${tahun}`;
    const bulanIniString = `${namaBulan} ${tahun}`;

    try {
        // Random delay sebelum login (5-8 detik) untuk menghindari rate limit
        const randomDelay = Math.floor(Math.random() * 3000) + 5000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        const loginPage = await client.get('https://spada.untagsmg.ac.id/login/index.php');
        const token = cheerio.load(loginPage.data)('input[name="logintoken"]').val();

        if (!token) {
            throw new Error('Login token tidak ditemukan di halaman login');
        }

        // Delay setelah get login page sebelum post login (4-6 detik)
        await new Promise(resolve => setTimeout(resolve, 4000 + Math.floor(Math.random() * 2000)));

        await client.post('https://spada.untagsmg.ac.id/login/index.php', new URLSearchParams({
            username: mhs.nim,
            password: mhs.pass,
            logintoken: token
        }));

        // Delay setelah login sebelum akses halaman attendance (5-7 detik)
        await new Promise(resolve => setTimeout(resolve, 5000 + Math.floor(Math.random() * 2000)));

        const page = await client.get(`https://spada.untagsmg.ac.id/mod/attendance/view.php?id=${matkul.id}`);
        const $ = cheerio.load(page.data);
        const pageText = $.text();

        // Check if login was successful
        if (pageText.includes('Invalid login') || pageText.includes('Login gagal')) {
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
            // Selalu kirim notif untuk status sudah hadir
            return {
                success: true,
                message: buatLaporan(`✅ Aman terkendali! Status kamu udah *HADIR* hari ini.`, hitungHadirBulanIni),
                status: 'already_present'
            };
        }

        if (linkAbsen) {
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
            : error.response?.status
                ? `HTTP ${error.response.status}: ${error.response.statusText}`
                : error.message || 'Unknown error';

        logError(`Error proses absen ${mhs.nim} - ${matkul.nama}: ${errorMsg}`, error);

        // Retry once on timeout
        if (error.code === 'ETIMEDOUT' && retryCount === 0) {
            logError(`Retrying attendance for ${mhs.nim} - ${matkul.nama}`, new Error('First attempt timed out'));
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
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
