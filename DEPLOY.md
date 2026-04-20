# Deploy Scripts

## Auto Deploy (Full)
Deploy otomatis ke GitHub + VPS sekaligus.

### Setup:
1. Edit `deploy.sh`, ubah konfigurasi VPS:
   ```bash
   VPS_USER="your_vps_user"      # Username SSH VPS
   VPS_HOST="your_vps_ip"        # IP atau domain VPS
   VPS_PATH="/path/to/botspada"  # Path folder bot di VPS
   BOT_NAME="botspada"           # Nama PM2 process
   ```

2. Setup SSH key (opsional, biar gak perlu password):
   ```bash
   ssh-copy-id your_user@your_vps
   ```

### Usage:
```bash
./deploy.sh "pesan commit kamu"
```

Script akan:
- ✅ Commit & push ke GitHub
- ✅ SSH ke VPS
- ✅ Pull update
- ✅ Install dependencies
- ✅ Restart bot
- ✅ Show status & logs

---

## Quick Deploy
Hanya push ke GitHub, manual update di VPS.

### Usage:
```bash
./quick-deploy.sh "pesan commit kamu"
```

Lalu di VPS:
```bash
ssh your_user@your_vps
cd /path/to/botspada
git pull && pm2 restart botspada
```

---

## Manual Deploy
Kalau mau manual step by step:

```bash
# 1. Push ke GitHub
git add .
git commit -m "your message"
git push origin main

# 2. Update di VPS
ssh your_user@your_vps
cd /path/to/botspada
pm2 stop botspada
git pull origin main
npm install --production
pm2 restart botspada
pm2 logs botspada
```

---

## Tips
- Gunakan `deploy.sh` untuk update penting yang perlu cepat
- Gunakan `quick-deploy.sh` untuk update kecil
- Selalu cek logs setelah deploy: `pm2 logs botspada`
