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

Web App build env:

- Prod: `/srv/orviko/prod/app/apps/web-app/.env.production`
- Dev: `/srv/orviko/dev/app/apps/web-app/.env.production`

Catatan penting:

- Secret tidak boleh dicommit ke Git.
- Backend membaca env dari `.env` root app.
- Prod memakai `NODE_ENV=production`.
- Dev memakai `NODE_ENV=development` agar aman memakai database `orviko_dev`.

Contoh perbedaan penting:

```env
# Prod
API_PORT=4000
DATABASE_URL=postgres://orviko_app:password-kuat@127.0.0.1:5432/orviko_prod
FRONTEND_BASE_URL=https://orviko.net
CORS_ALLOWED_ORIGINS=https://orviko.net,https://www.orviko.net
GOOGLE_REDIRECT_URI=https://orviko.net/auth/google/callback
PROFILE_DOCUMENT_STORAGE_DIR=/srv/orviko/prod/storage/profile-documents
LYNK_PROFILE_URL=https://lynk.id/rizki-09
LYNK_WEBHOOK_SECRET=isi_secret_webhook_production
LYNK_CHECKOUT_ORDER_REFERENCE_PARAM=merchant_order_id
LYNK_CHECKOUT_ORDER_REFERENCE_CONFIRMED=true
LYNK_WEBHOOK_PROVIDER_AUTH_CONFIRMED=true
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
LYNK_CHECKOUT_ORDER_REFERENCE_PARAM=merchant_order_id
LYNK_CHECKOUT_ORDER_REFERENCE_CONFIRMED=false
```

Jika produk Lynk.id per paket sudah dibuat, tambahkan URL produk langsung:

```env
LYNK_MINI_URL=https://lynk.id/rizki-09/...
LYNK_STARTER_URL=https://lynk.id/rizki-09/...
LYNK_PRO_URL=https://lynk.id/rizki-09/...
```

Jika URL paket belum diisi, checkout Orviko akan fallback ke `LYNK_PROFILE_URL`.

Nama `LYNK_CHECKOUT_ORDER_REFERENCE_PARAM` harus mengikuti parameter yang Lynk benar-benar
simpan dan kembalikan sebagai merchant/order reference pada webhook. Jangan set flag
confirmation ke `true` hanya karena redirect berhasil; buktikan melalui transaksi dev nyata.

Zero-price override tidak didukung. Environment development wajib memakai nominal
catalog yang sama dengan production.

Web App harus memakai API origin environment yang sama:

```env
# /srv/orviko/prod/app/apps/web-app/.env.production
VITE_WEB_APP_API_BASE_URL=https://orviko.net
```

```env
# /srv/orviko/dev/app/apps/web-app/.env.production
VITE_WEB_APP_API_BASE_URL=https://dev.orviko.net
```

## Services

Systemd services:

- Prod: `orviko-api-prod`
- Dev: `orviko-api-dev`
- Prod durable AI worker: `orviko-worker-prod`
- Dev durable AI worker: `orviko-worker-dev`

Useful commands:

```bash
systemctl status orviko-api-prod --no-pager
systemctl status orviko-api-dev --no-pager
systemctl status orviko-worker-prod --no-pager
systemctl status orviko-worker-dev --no-pager

systemctl restart orviko-api-prod
systemctl restart orviko-api-dev
systemctl restart orviko-worker-prod
systemctl restart orviko-worker-dev

tail -80 /srv/orviko/prod/logs/api-error.log
tail -80 /srv/orviko/dev/logs/api-error.log
```

Service files:

- `/etc/systemd/system/orviko-api-prod.service`
- `/etc/systemd/system/orviko-api-dev.service`

## Nginx

Nginx config:

- Source prod: `ops/nginx/orviko.net.conf`
- Source dev: `ops/nginx/dev.orviko.net.conf`
- Active prod: `/etc/nginx/sites-available/orviko.net`
- Active dev: `/etc/nginx/sites-available/dev.orviko.net`

Konfigurasi versioned sudah memuat redirect HTTP, listener TLS, dan certificate path
Certbot untuk domain masing-masing. Certificate harus sudah tersedia sebelum file diaktifkan.

```bash
sudo install -m 0644 ops/nginx/orviko.net.conf /etc/nginx/sites-available/orviko.net
sudo install -m 0644 ops/nginx/dev.orviko.net.conf /etc/nginx/sites-available/dev.orviko.net
sudo nginx -t
sudo systemctl reload nginx
```

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

- Prod landing: `/srv/orviko/prod/app/apps/web/dist`
- Prod Web App: `/srv/orviko/prod/app/apps/web-app/dist`
- Dev landing: `/srv/orviko/dev/app/apps/web/dist`
- Dev Web App: `/srv/orviko/dev/app/apps/web-app/dist`

API routes proxied by Nginx:

- `/auth/`
- `/payments/`
- `/profile-documents/`
- `/meeting-contexts/`
- `/live-meetings/`
- `/health`

Web App route:

- `/app/` must serve `apps/web-app/dist/index.html`.
- `/app/assets/` and `/app/audio/` must serve files from `apps/web-app/dist`.
- Browser refresh on `/app/...` must fall back to the Web App `index.html`, not landing page.

Nginx location pattern for each environment:

```nginx
root /srv/orviko/prod/app/apps/web/dist;
index index.html;

location ^~ /app/assets/ {
  alias /srv/orviko/prod/app/apps/web-app/dist/assets/;
  access_log off;
  expires 1y;
}

location ^~ /app/audio/ {
  alias /srv/orviko/prod/app/apps/web-app/dist/audio/;
  access_log off;
  expires 1d;
}

location ^~ /app/ {
  alias /srv/orviko/prod/app/apps/web-app/dist/;
  add_header Cache-Control "no-store";
  try_files $uri $uri/ /app/index.html;
}

location / {
  try_files $uri $uri/ /index.html;
}
```

For dev, replace `/srv/orviko/prod/` with `/srv/orviko/dev/`.

Webhook Lynk.id:

- Dev: `https://dev.orviko.net/payments/lynk/webhook`
- Prod: `https://orviko.net/payments/lynk/webhook`

Secret tidak boleh berada di query string. Lynk harus mengirimkannya melalui header
`x-orviko-lynk-webhook-secret`. Production juga memerlukan
`LYNK_WEBHOOK_PROVIDER_AUTH_CONFIRMED=true` setelah mekanisme autentikasi tersebut
dikonfirmasi oleh provider.

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

### Update Dev

```bash
cd /srv/orviko/dev/app
git pull origin dev
npm run build
npm run db:migrate
systemctl restart orviko-api-dev
systemctl restart orviko-worker-dev
curl -i https://dev.orviko.net/health
curl -i https://dev.orviko.net/ready
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
systemctl restart orviko-worker-prod
curl -i https://orviko.net/health
curl -i https://orviko.net/ready
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
curl -i https://orviko.net/ready
systemctl status orviko-api-prod --no-pager
```

Dev:

```bash
curl -I https://dev.orviko.net
curl -i https://dev.orviko.net/health
curl -i https://dev.orviko.net/ready
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
