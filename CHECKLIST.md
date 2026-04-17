# Pre-Deployment Checklist

## ✅ Yang Sudah Siap

### Core Features
- [x] Auto absensi setiap 5 menit
- [x] Multi-user dengan enkripsi password
- [x] Payment gateway QRIS (Pakasir)
- [x] Admin panel lengkap
- [x] Attendance history & statistics
- [x] Achievement system
- [x] Prediksi kehadiran
- [x] Jadwal kuliah terintegrasi
- [x] Cooldown system (anti spam)

### Files & Configuration
- [x] ecosystem.config.js (PM2 config)
- [x] .env.example (template environment)
- [x] .gitignore (updated)
- [x] README.md (dokumentasi)
- [x] DEPLOYMENT.md (panduan deploy)
- [x] package.json (dengan PM2 scripts)

### Security
- [x] Password encryption (AES-256)
- [x] Session management dengan cookies
- [x] Rate limiting per command
- [x] Admin-only commands
- [x] .env tidak di-commit

## 📋 Yang Perlu Disiapkan di VPS

### 1. Server Requirements
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2
```

### 2. Upload Project
```bash
# Via Git (recommended)
git clone <your-repo-url>
cd botspada

# Atau upload manual via SCP/FTP
```

### 3. Setup Environment
```bash
# Copy template
cp .env.example .env

# Edit dengan data asli
nano .env
```

Isi yang perlu diubah di .env:
- `TELE_TOKEN` - Token bot dari @BotFather
- `ADMIN_ID` - Chat ID Telegram kamu
- `PAKASIR_API_KEY` - API key dari Pakasir
- `ENCRYPTION_KEY` - Generate random 64 karakter

### 4. Install & Run
```bash
# Install dependencies
npm install

# Buat folder logs
mkdir -p logs

# Start dengan PM2
npm run pm2:start

# Auto-start saat reboot
pm2 startup
pm2 save
```

## 🔍 Testing Checklist

Setelah deploy, test fitur-fitur ini:

### User Flow
- [ ] `/start` - Bot respond dengan menu
- [ ] `/input <nim> <password>` - Registrasi berhasil
- [ ] `/bayar` - Generate QRIS payment
- [ ] Scan QRIS & bayar - Auto aktivasi
- [ ] `/status` - Tampil status aktif
- [ ] `/cek` - Cek absensi hari ini
- [ ] `/sapujagat` - Absen semua matkul
- [ ] `/jadwal` - Tampil jadwal kuliah
- [ ] `/history` - Tampil riwayat absensi
- [ ] `/predict` - Prediksi kehadiran

### Admin Flow
- [ ] `/list` - List semua user
- [ ] `/cek <nim>` - Detail user
- [ ] `/acc <nim>` - Aktivasi manual
- [ ] `/addmanual` - Tambah user titipan

### Auto Features
- [ ] Auto absensi jalan setiap 5 menit
- [ ] Notifikasi absensi berhasil
- [ ] Achievement unlock otomatis

## 🚨 Troubleshooting

### Bot tidak respond
```bash
pm2 logs botspada --err
pm2 restart botspada
```

### Memory leak
```bash
pm2 monit
pm2 restart botspada
```

### Port sudah digunakan
```bash
sudo lsof -i :3000
sudo kill -9 <PID>
```

## 📊 Monitoring

### Cek Status
```bash
pm2 status
pm2 monit
```

### Lihat Logs
```bash
pm2 logs botspada
pm2 logs botspada --lines 100
```

### Backup Data
```bash
# Backup setiap hari
cp users.json users.json.backup
cp attendance_history.json attendance_history.json.backup
cp achievements.json achievements.json.backup
```

## 🎯 Performance

- Memory limit: 500MB (auto restart)
- Auto restart on crash
- Log rotation otomatis
- Cooldown 3 detik per command

## 📝 Notes

- Bot menggunakan **long polling** (tidak perlu webhook)
- Port 3000 hanya untuk webhook Pakasir
- Pastikan firewall allow port 3000
- Backup data secara berkala
- Update dependencies secara rutin

## ✨ Ready to Deploy!

Semua sudah siap. Tinggal:
1. Upload ke VPS
2. Setup .env
3. npm install
4. npm run pm2:start
5. Test semua fitur

Good luck! 🚀
