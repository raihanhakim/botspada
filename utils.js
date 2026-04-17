import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY tidak ditemukan di .env');
}

export function encrypt(text) {
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext) {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
}

export function validateNIM(nim) {
    return /^\d{8,15}$/.test(nim);
}

export function validatePassword(password) {
    return password.length >= 4 && password.length <= 50;
}

export function hitungSisaHari(tanggalExpire) {
    const now = new Date();
    const expire = new Date(tanggalExpire);
    const diff = expire - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function tambahHari(hari) {
    const date = new Date();
    date.setDate(date.getDate() + hari);
    return date.toISOString();
}

export function buatProgressBar(persentase) {
    const persen = parseFloat(persentase);
    const filled = Math.floor(persen / 10);
    const empty = 10 - filled;

    let bar = '';
    for (let i = 0; i < filled; i++) {
        bar += '🟩';
    }
    if (persen % 10 >= 5 && empty > 0) {
        bar += '🟨';
        for (let i = 0; i < empty - 1; i++) {
            bar += '⬜';
        }
    } else {
        for (let i = 0; i < empty; i++) {
            bar += '⬜';
        }
    }

    return bar;
}

export function getStatusEmoji(persentase) {
    const persen = parseFloat(persentase);
    if (persen >= 90) return '🟢';
    if (persen >= 75) return '🟡';
    if (persen >= 60) return '🟠';
    return '🔴';
}

export function hitungPrediksi(persentaseSekarang, jumlahHadir, totalPertemuan, pertemuanTersisa) {
    const persen = parseFloat(persentaseSekarang);
    const target = 75; // Minimal kehadiran

    if (persen >= target) {
        return {
            status: 'aman',
            message: 'AMAN ✅',
            detail: `Kamu udah di atas batas aman (${target}%)`
        };
    }

    const totalDibutuhkan = Math.ceil((target / 100) * totalPertemuan);
    const masihPerluHadir = totalDibutuhkan - jumlahHadir;

    if (masihPerluHadir <= 0) {
        return {
            status: 'aman',
            message: 'AMAN ✅',
            detail: 'Persentase kamu sudah cukup'
        };
    }

    if (masihPerluHadir > pertemuanTersisa) {
        return {
            status: 'kritis',
            message: 'KRITIS 🔴',
            detail: `Butuh hadir ${masihPerluHadir}x tapi cuma tersisa ${pertemuanTersisa}x pertemuan. Sudah tidak mungkin mencapai ${target}%`
        };
    }

    if (masihPerluHadir === pertemuanTersisa) {
        return {
            status: 'bahaya',
            message: 'BAHAYA ⚠️',
            detail: `Harus hadir SEMUA ${pertemuanTersisa}x pertemuan tersisa!`
        };
    }

    return {
        status: 'perhatian',
        message: 'PERLU PERHATIAN 🟡',
        detail: `Butuh hadir ${masihPerluHadir}x dari ${pertemuanTersisa}x pertemuan tersisa`
    };
}

export function formatTanggal(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

export function getWeekRange() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { start: monday, end: sunday };
}
