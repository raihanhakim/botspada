import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { logError, logAbsensi, saveAttendanceHistory, checkAndAwardAchievements } from './database.js';

export async function prosesAbsen(mhs, matkul, forceNotif = false) {
    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        timeout: 30000
    }));

    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const namaBulan = months[d.getMonth()];
    const tahun = d.getFullYear();

    const tglHariIni = `${d.getDate()} ${namaBulan} ${tahun}`;
    const bulanIniString = `${namaBulan} ${tahun}`;

    try {
        const loginPage = await client.get('https://spada.untagsmg.ac.id/login/index.php');
        const token = cheerio.load(loginPage.data)('input[name="logintoken"]').val();

        await client.post('https://spada.untagsmg.ac.id/login/index.php', new URLSearchParams({
            username: mhs.nim,
            password: mhs.pass,
            logintoken: token
        }));

        const page = await client.get(`https://spada.untagsmg.ac.id/mod/attendance/view.php?id=${matkul.id}`);
        const $ = cheerio.load(page.data);
        const pageText = $.text();

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
            if (forceNotif) {
                return {
                    success: true,
                    message: buatLaporan(`✅ Aman terkendali! Status kamu udah *HADIR* hari ini.`, hitungHadirBulanIni),
                    status: 'already_present'
                };
            }
            return { success: true, status: 'already_present' };
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
        logError(`Error proses absen ${mhs.nim} - ${matkul.nama}`, error);
        if (forceNotif) {
            return {
                success: false,
                message: `❌ Aduh, koneksi ke Spada lagi macet pas buka *${matkul.nama}*. Santai, nanti dicoba lagi.`,
                status: 'error'
            };
        }
        return { success: false, status: 'error' };
    }
}
