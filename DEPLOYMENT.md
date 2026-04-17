# Bot SPADA - Deployment Guide

## Prerequisites VPS
- Node.js v18+ 
- npm atau yarn
- PM2 (untuk process management)
- Git (optional)

## Setup di VPS

### 1. Install Dependencies
```bash
# Install Node.js (jika belum)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2
```

### 2. Upload Project
```bash
# Via Git
git clone <repository-url>
cd botspada

# Atau upload manual via SCP/FTP
```

### 3. Install Package
```bash
npm install
```

### 4. Setup Environment
```bash
# Copy dan edit .env
cp .env.example .env
nano .env
```

Isi file .env:
```
TELE_TOKEN=your_telegram_bot_token
ADMIN_ID=your_telegram_chat_id
PAKASIR_API_KEY=your_pakasir_api_key
PAKASIR_PROJECT=botspada
HARGA_BOT=1000
ENCRYPTION_KEY=your_encryption_key_64_chars
PORT=3000
MASA_AKTIF_HARI=30
```

### 5. Buat Folder Logs
```bash
mkdir -p logs
```

### 6. Jalankan Bot dengan PM2
```bash
# Start bot
pm2 start ecosystem.config.js

# Lihat status
pm2 status

# Lihat logs
pm2 logs botspada

# Stop bot
pm2 stop botspada

# Restart bot
pm2 restart botspada

# Auto-start saat VPS reboot
pm2 startup
pm2 save
```

## Monitoring

### Cek Status Bot
```bash
pm2 status
pm2 monit
```

### Lihat Logs
```bash
# Real-time logs
pm2 logs botspada

# Error logs
pm2 logs botspada --err

# Output logs
pm2 logs botspada --out
```

### Restart Otomatis
PM2 akan otomatis restart bot jika:
- Bot crash
- Memory usage > 500MB
- Ada error fatal

## Maintenance

### Update Bot
```bash
# Stop bot
pm2 stop botspada

# Pull update (jika pakai git)
git pull

# Install dependencies baru (jika ada)
npm install

# Restart bot
pm2 restart botspada
```

### Backup Data
```bash
# Backup users dan history
cp users.json users.json.backup
cp attendance_history.json attendance_history.json.backup
cp achievements.json achievements.json.backup
```

### Clear Logs
```bash
pm2 flush botspada
```

## Troubleshooting

### Bot tidak jalan
```bash
# Cek logs error
pm2 logs botspada --err

# Cek status
pm2 status

# Restart
pm2 restart botspada
```

### Memory leak
```bash
# Cek memory usage
pm2 monit

# Restart jika perlu
pm2 restart botspada
```

### Port sudah digunakan
```bash
# Cek port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

## Security Checklist
- ✅ .env tidak di-commit ke git
- ✅ Gunakan HTTPS untuk webhook (jika ada)
- ✅ Firewall hanya buka port yang diperlukan
- ✅ Update Node.js dan dependencies secara berkala
- ✅ Backup data secara rutin

## Performance Tips
- Bot menggunakan long polling (tidak perlu webhook)
- Auto attendance check setiap 5 menit
- Cooldown 3 detik per command untuk prevent spam
- Memory limit 500MB (auto restart jika exceed)
