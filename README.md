# Bot SPADA - Absensi Otomatis

Bot Telegram untuk absensi otomatis SPADA dengan sistem pembayaran terintegrasi.

## Features
- ✅ Auto absensi setiap 5 menit
- ✅ Multi-user support dengan enkripsi data
- ✅ Payment gateway (Pakasir - QRIS & VA)
- ✅ Admin panel untuk manage users
- ✅ Attendance history & statistics
- ✅ Achievement system
- ✅ Prediksi kehadiran
- ✅ Jadwal kuliah terintegrasi

## Tech Stack
- Node.js + Express
- Telegram Bot API
- Axios + Cookie Jar (session management)
- Cheerio (HTML parsing)
- Crypto-JS (encryption)
- Node-Cron (scheduler)

## Quick Start

### 1. Clone & Install
```bash
git clone <repo-url>
cd botspada
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
nano .env
```

### 3. Run Bot
```bash
# Development
npm run dev

# Production
npm start
```

## Commands

### User Commands
- `/start` - Mulai bot & lihat menu
- `/input <nim> <password>` - Daftar akun
- `/bayar` - Bayar aktivasi
- `/status` - Cek status akun
- `/cek` - Cek absensi hari ini
- `/sapujagat` - Absen semua matkul
- `/jadwal` - Lihat jadwal kuliah
- `/history` - Riwayat absensi
- `/predict` - Prediksi kehadiran
- `/help` - Bantuan

### Admin Commands
- `/list` - List semua user
- `/cek <nim>` - Cek detail user
- `/acc <nim>` - Aktivasi user manual
- `/addmanual <nim> <nama> <password>` - Tambah user titipan

## File Structure
```
botspada/
├── index.js              # Main bot logic
├── telegram.js           # Telegram API wrapper
├── spada.js             # SPADA scraping & absensi
├── pakasir.js           # Payment gateway
├── database.js          # User & data management
├── jadwal.js            # Jadwal kuliah
├── utils.js             # Helper functions
├── ecosystem.config.js  # PM2 config
├── users.json           # User database
├── attendance_history.json
├── achievements.json
└── bot.log
```

## Deployment
Lihat [DEPLOYMENT.md](DEPLOYMENT.md) untuk panduan lengkap deploy ke VPS.

## Security
- Password di-encrypt dengan AES-256
- Session cookies aman dengan tough-cookie
- Rate limiting per command
- Admin-only commands

## License
Private - All Rights Reserved
