# VPS Deployment Guide

Dokumen ini menjelaskan kondisi eksisting VPS Orviko per 1 Juni 2026.

## Status Saat Ini

Orviko berjalan di satu VPS Alibaba Cloud Simple Application Server.

- OS: Ubuntu 22.04 LTS
- Public IP: `147.139.206.25`
- RAM: 1 GB
- Disk: 30 GB
- Swap: 2 GB
- Web server: Nginx
- API process manager: systemd
- Database: PostgreSQL lokal
- HTTPS: Certbot / Let's Encrypt

Environment yang aktif:

- Prod: `https://orviko.net`
- Dev: `https://dev.orviko.net`

## Arsitektur Deployment

Prod dan dev dipisah berdasarkan folder, branch, port API, dan database.

| Environment | Domain | Branch | API Port | Database | Service |
| --- | --- | --- | --- | --- | --- |
| Prod | `orviko.net` | `main` | `4000` | `orviko_prod` | `orviko-api-prod` |
| Dev | `dev.orviko.net` | `dev` | `4001` | `orviko_dev` | `orviko-api-dev` |

Nginx melayani static web dari hasil build Vite, lalu meneruskan route API tertentu ke service Node.js lokal.

## Struktur Folder VPS

```txt
/srv/orviko/
  prod/
    app/
    env/
    logs/
    backups/
    storage/
      profile-documents/
  dev/
    app/
    env/
    logs/
    backups/
    storage/
      profile-documents/
```

Folder utama aplikasi:

- Prod app: `/srv/orviko/prod/app`
- Dev app: `/srv/orviko/dev/app`

Log API:

- Prod log: `/srv/orviko/prod/logs/api.log`
- Prod error log: `/srv/orviko/prod/logs/api-error.log`
- Dev log: `/srv/orviko/dev/logs/api.log`
- Dev error log: `/srv/orviko/dev/logs/api-error.log`

## Environment

Backend/API env:

- Prod: `/srv/orviko/prod/app/.env`
- Dev: `/srv/orviko/dev/app/.env`

Frontend web build env:

- Prod: `/srv/orviko/prod/app/apps/web/.env.production`
- Dev: `/srv/orviko/dev/app/apps/web/.env.production`

Catatan penting:

- Secret tidak boleh dicommit ke Git.
- Backend membaca env dari `.env` root app.
- Prod memakai `NODE_ENV=production`.
- Dev memakai `NODE_ENV=development` agar aman memakai database `orviko_dev`.

Contoh perbedaan penting:

```env
# Prod
API_PORT=4000
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/orviko_prod
FRONTEND_BASE_URL=https://orviko.net
GOOGLE_REDIRECT_URI=https://orviko.net/auth/google/callback
PROFILE_DOCUMENT_STORAGE_DIR=/srv/orviko/prod/storage/profile-documents
LYNK_PROFILE_URL=https://lynk.id/rizki-09
LYNK_WEBHOOK_SECRET=isi_secret_webhook_production
```

```env
# Dev
API_PORT=4001
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/orviko_dev
FRONTEND_BASE_URL=https://dev.orviko.net
GOOGLE_REDIRECT_URI=https://dev.orviko.net/auth/google/callback
PROFILE_DOCUMENT_STORAGE_DIR=/srv/orviko/dev/storage/profile-documents
LYNK_PROFILE_URL=https://lynk.id/rizki-09
LYNK_WEBHOOK_SECRET=isi_secret_webhook_dev
```

Jika produk Lynk.id per paket sudah dibuat, tambahkan URL produk langsung:

```env
LYNK_MINI_URL=https://lynk.id/rizki-09/...
LYNK_STARTER_URL=https://lynk.id/rizki-09/...
LYNK_PRO_URL=https://lynk.id/rizki-09/...
```

Jika URL paket belum diisi, checkout Orviko akan fallback ke `LYNK_PROFILE_URL`.

Untuk testing harga `Rp0` di dev/staging, gunakan price override backend agar nominal pending payment Orviko tetap cocok dengan webhook Lynk.id:

```env
ORVIKO_MINI_PRICE=0
```

Jangan pasang override harga `0` di prod. API production akan menolak start jika ada override harga `0`.

## Services

Systemd services:

- Prod: `orviko-api-prod`
- Dev: `orviko-api-dev`

Useful commands:

```bash
systemctl status orviko-api-prod --no-pager
systemctl status orviko-api-dev --no-pager

systemctl restart orviko-api-prod
systemctl restart orviko-api-dev

tail -80 /srv/orviko/prod/logs/api-error.log
tail -80 /srv/orviko/dev/logs/api-error.log
```

Service files:

- `/etc/systemd/system/orviko-api-prod.service`
- `/etc/systemd/system/orviko-api-dev.service`

## Nginx

Nginx config:

- Prod: `/etc/nginx/sites-available/orviko.net`
- Dev: `/etc/nginx/sites-available/dev.orviko.net`

Enabled symlinks:

- `/etc/nginx/sites-enabled/orviko.net`
- `/etc/nginx/sites-enabled/dev.orviko.net`

Useful commands:

```bash
nginx -t
systemctl reload nginx
systemctl status nginx --no-pager
```

Nginx serves static web from:

- Prod: `/srv/orviko/prod/app/apps/web/dist`
- Dev: `/srv/orviko/dev/app/apps/web/dist`

API routes proxied by Nginx:

- `/auth/`
- `/payments/`
- `/profile-documents/`
- `/meeting-contexts/`
- `/live-meetings/`
- `/health`

Webhook Lynk.id:

- Dev: `https://dev.orviko.net/payments/lynk/webhook?secret=isi_secret_webhook_dev`
- Prod: `https://orviko.net/payments/lynk/webhook?secret=isi_secret_webhook_production`

Gunakan URL dev lebih dulu untuk `Test URL` di dashboard Lynk.id. Setelah webhook transaksi sukses terbukti mengaktifkan subscription di dev, baru pindahkan URL dashboard Lynk.id ke prod.

## HTTPS / Certbot

HTTPS is enabled with Certbot / Let's Encrypt.

Certificates:

- Prod: `/etc/letsencrypt/live/orviko.net/`
- Dev: `/etc/letsencrypt/live/dev.orviko.net/`

Certbot auto-renew is enabled.

Useful commands:

```bash
certbot certificates
certbot renew --dry-run
systemctl list-timers | grep certbot
```

## DNS

Current DNS records:

```txt
orviko.net      A  147.139.206.25
www.orviko.net  A  147.139.206.25
dev.orviko.net  A  147.139.206.25
```

Useful checks:

```bash
dig +short orviko.net
dig +short dev.orviko.net
getent hosts orviko.net
getent hosts dev.orviko.net
```

## Database

Databases:

- Prod: `orviko_prod`
- Dev: `orviko_dev`

Migration command:

```bash
cd /srv/orviko/prod/app
npm run db:migrate
```

```bash
cd /srv/orviko/dev/app
npm run db:migrate
```

If needed, ensure database exists:

```bash
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'orviko_prod';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'orviko_dev';"
```

## Deployment Flow

### Desktop Update Feed Dev

Auto-updater desktop dev membaca manifest dari:

```txt
https://dev.orviko.net/updates/windows/latest.yml
```

Artefak updater tidak disimpan di dalam Git atau folder build web. Simpan terpisah di VPS:

```txt
/srv/orviko/dev/updates/windows/
  latest.yml
  Orviko-Setup-0.1.1-dev.exe
  Orviko-Setup-0.1.1-dev.exe.blockmap
```

Tambahkan route berikut ke server block `dev.orviko.net`:

```nginx
location = /updates/windows/latest.yml {
    alias /srv/orviko/dev/updates/windows/latest.yml;
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}

location /updates/windows/ {
    alias /srv/orviko/dev/updates/windows/;
}
```

Siapkan folder dan aktifkan konfigurasi:

```bash
mkdir -p /srv/orviko/dev/updates/windows
nginx -t
systemctl reload nginx
```

Build release dilakukan di Windows dari root project:

```powershell
npm --workspace @interview-app/desktop run dist:win
```

Upload file versi dan blockmap terlebih dahulu. Upload `latest.yml` paling akhir agar client tidak pernah melihat manifest sebelum installer siap:

```powershell
scp apps/desktop/release/Orviko-Setup-0.1.1-dev.exe admin@147.139.206.25:/srv/orviko/dev/updates/windows/
scp apps/desktop/release/Orviko-Setup-0.1.1-dev.exe.blockmap admin@147.139.206.25:/srv/orviko/dev/updates/windows/
scp apps/desktop/release/latest.yml admin@147.139.206.25:/srv/orviko/dev/updates/windows/
```

Verifikasi feed dan installer:

```bash
curl -I https://dev.orviko.net/updates/windows/latest.yml
curl -I https://dev.orviko.net/updates/windows/Orviko-Setup-0.1.1-dev.exe
```

Versi `0.1.1` adalah bootstrap dan masih perlu dipasang manual. Pengujian auto-update pertama dilakukan dengan memasang `0.1.1`, lalu menerbitkan `0.1.2` melalui urutan yang sama. Setiap release wajib menaikkan versi di `apps/desktop/package.json`; jangan menimpa installer versi lama dengan isi berbeda.

### Update Dev

```bash
cd /srv/orviko/dev/app
git pull origin dev
npm run build
npm run db:migrate
systemctl restart orviko-api-dev
curl -i https://dev.orviko.net/health
```

Run `npm ci` only if `package-lock.json` changed:

```bash
npm ci --no-audit --no-fund --maxsockets=2
```

### Update Prod

```bash
cd /srv/orviko/prod/app
git pull origin main
npm run build
npm run db:migrate
systemctl restart orviko-api-prod
curl -i https://orviko.net/health
```

Run `npm ci` only if `package-lock.json` changed:

```bash
npm ci --no-audit --no-fund --maxsockets=2
```

## Health Check

Prod:

```bash
curl -I https://orviko.net
curl -i https://orviko.net/health
systemctl status orviko-api-prod --no-pager
```

Dev:

```bash
curl -I https://dev.orviko.net
curl -i https://dev.orviko.net/health
systemctl status orviko-api-dev --no-pager
```

Local API checks:

```bash
curl -i http://127.0.0.1:4000/health
curl -i http://127.0.0.1:4001/health
```

## Troubleshooting

### API Crash Karena Env

Cek status dan log:

```bash
systemctl status orviko-api-prod --no-pager -l
tail -80 /srv/orviko/prod/logs/api-error.log
```

```bash
systemctl status orviko-api-dev --no-pager -l
tail -80 /srv/orviko/dev/logs/api-error.log
```

Jika muncul error production env unsafe, cek `.env` terkait.

### Migration Mengarah Ke DB Salah

Pastikan `DATABASE_URL` di `.env` benar. Drizzle config sudah dibuat membaca `.env`, tetapi command harus dijalankan dari folder app environment yang benar.

```bash
cd /srv/orviko/prod/app
npm run db:migrate
```

```bash
cd /srv/orviko/dev/app
npm run db:migrate
```

### DNS Belum Propagate

Cek:

```bash
dig +short dev.orviko.net
```

Certbot hanya bisa berhasil setelah DNS domain mengarah ke VPS.

### Nginx Config Error

Cek:

```bash
nginx -t
```

Jika valid:

```bash
systemctl reload nginx
```

### npm ci Berat Di VPS

VPS 0.5 GB RAM sempat membuat `npm ci` stuck dan Workbench tidak stabil. VPS sudah di-upgrade ke 1 GB RAM dan swap 2 GB.

Gunakan:

```bash
npm ci --no-audit --no-fund --maxsockets=2
```

Jika `package-lock.json` prod dan dev sama, dependency dev dapat disalin dari prod untuk menghindari install ulang:

```bash
cmp -s /srv/orviko/prod/app/package-lock.json /srv/orviko/dev/app/package-lock.json && echo "lockfile sama" || echo "lockfile beda"
```

Jika sama:

```bash
rm -rf /srv/orviko/dev/app/node_modules
cp -a /srv/orviko/prod/app/node_modules /srv/orviko/dev/app/node_modules
```

### Workbench Bermasalah

Masalah yang pernah terjadi:

- Workbench `SocketTimeoutException`.
- Command Assistant tidak terdeteksi.
- Login password benar tapi Workbench tetap gagal.

Yang membantu:

- Pastikan server status `Running`.
- Install Command Assistant dari dashboard Alibaba.
- Restart server setelah Command Assistant install.
- Gunakan terminal SSH lokal sebagai fallback.

## Catatan Operasional

- Prod dan dev berjalan bersamaan di satu VPS.
- Prod dan dev dipisah lewat port API, folder, branch, dan database.
- Jangan menjalankan API manual jangka panjang dari terminal; gunakan systemd.
- Jangan menaruh secret di repo.
- Checkout aktif memakai Lynk.id dan webhook harus dikonfigurasi dengan secret environment yang sesuai.
