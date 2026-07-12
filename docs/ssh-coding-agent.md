# SSH Runbook untuk Coding Agent

Panduan ini dipakai coding agent yang melakukan audit dan deployment Orviko dari Windows
PowerShell ke VPS Ubuntu.

## Target

- Host: `147.139.206.25`
- User deployment: `root`
- Dev app: `/srv/orviko/dev/app`
- Prod app: `/srv/orviko/prod/app`
- Dev branch/API: `dev` / `4001`
- Prod branch/API: `main` / `4000`

Gunakan kondisi VPS aktual sebagai source of truth. Jangan menganggap dokumentasi ini
menggantikan preflight audit.

## Private Key

Private key tidak boleh masuk repository atau chat. Contoh path Windows:

```powershell
C:\Users\rizki\Downloads\orviko-deploy-2026.pem
```

Jika OpenSSH menolak key karena permission terlalu terbuka:

```powershell
icacls "C:\Users\rizki\Downloads\orviko-deploy-2026.pem" /inheritance:r
icacls "C:\Users\rizki\Downloads\orviko-deploy-2026.pem" /remove:g "DESKTOP-K9JKGE1\CodexSandboxUsers"
icacls "C:\Users\rizki\Downloads\orviko-deploy-2026.pem" /grant:r "DESKTOP-K9JKGE1\rizki:(R)"
```

Sesuaikan domain komputer dan username. Jangan menyalin private key ke workspace.

## Koneksi Read-only

Mulai selalu dari command yang tidak mengubah server:

```powershell
ssh -i "C:\Users\rizki\Downloads\orviko-deploy-2026.pem" `
  -o StrictHostKeyChecking=accept-new `
  -o ConnectTimeout=10 `
  -o BatchMode=yes `
  root@147.139.206.25 `
  "whoami; hostname; cat /etc/os-release | head -n 2"
```

Jangan memakai `StrictHostKeyChecking=no` pada production.

## Preflight

```bash
cd /srv/orviko/dev/app
git -c safe.directory=/srv/orviko/dev/app status --short --branch
git -c safe.directory=/srv/orviko/dev/app log -1 --oneline
cd /srv/orviko/prod/app
git -c safe.directory=/srv/orviko/prod/app status --short --branch
git -c safe.directory=/srv/orviko/prod/app log -1 --oneline
systemctl is-active orviko-api-dev
systemctl is-active orviko-api-prod
systemctl is-active orviko-worker-dev
systemctl is-active orviko-worker-prod
nginx -t
df -h / /srv
free -h
ss -ltnp | grep -E ':(4000|4001|80|443)\b'
```

Gunakan `git -c safe.directory=<path>` jika root mendapat warning ownership. Jangan
mengubah ownership tanpa alasan. Jangan menghapus untracked env file.

## Deploy Dev

Deploy dev terlebih dahulu:

```bash
cd /srv/orviko/dev/app
sudo -u admin -H git pull --ff-only origin dev
sudo -u admin -H npm run build
sudo -u admin -H npm run db:migrate
systemctl restart orviko-api-dev
systemctl restart orviko-worker-dev
```

Jika lockfile berubah, jalankan `sudo -u admin -H npm ci --no-audit --no-fund --maxsockets=2`
sebelum build.

Verifikasi:

```powershell
curl.exe -i https://dev.orviko.net/health
curl.exe -i https://dev.orviko.net/ready
curl.exe -I https://dev.orviko.net/app/
```

Kedua API endpoint harus `200`. Response `/app/` harus Web App shell dengan asset
`/app/assets/`, bukan landing page.

## Deploy Production

Jangan deploy prod sebelum dev lulus dan database sudah dibackup.

### Backup

```bash
sudo -u postgres pg_dump -Fc -d orviko_prod -f /tmp/orviko_prod_pre_deploy_YYYYMMDD.dump
install -m 0640 -o postgres -g postgres /tmp/orviko_prod_pre_deploy_YYYYMMDD.dump /srv/orviko/prod/backups/orviko_prod_pre_deploy_YYYYMMDD.dump
cp /srv/orviko/prod/app/.env /srv/orviko/prod/backups/prod.env.pre-deploy-YYYYMMDD
chmod 600 /srv/orviko/prod/backups/prod.env.pre-deploy-YYYYMMDD
```

### Source, Build, Migration

Jika prod hanya memiliki untracked env dan tidak ada tracked changes, setelah konfirmasi
eksplisit sinkronkan ke remote:

```bash
cd /srv/orviko/prod/app
git fetch origin main
git status --short --branch
git reset --hard origin/main
npm ci --no-audit --no-fund --maxsockets=2
npm run build
npm run db:migrate
```

`reset --hard` tidak boleh dipakai jika ada tracked changes yang belum diamankan.
Untracked `.env` tidak ikut terhapus oleh command tersebut.

### Nginx dan Services

```bash
test -f /etc/letsencrypt/live/orviko.net/fullchain.pem
test -f /etc/letsencrypt/live/orviko.net/privkey.pem
install -m 0644 ops/nginx/orviko.net.conf /etc/nginx/sites-available/orviko.net
nginx -t
systemctl reload nginx
systemctl restart orviko-api-prod
systemctl restart orviko-worker-prod
```

Jika unit worker prod belum ada, buat dari template worker dev dengan path prod dan log
prod. Setelah memasang unit baru:

```bash
systemctl daemon-reload
systemctl enable --now orviko-worker-prod
```

## Environment dan Secret

Production membaca `/srv/orviko/prod/app/.env`. Jangan menyalin seluruh env dev ke prod.
Salin hanya variable provider yang diperlukan; database, port, domain, CORS, dan storage
harus tetap spesifik production.

Coding agent hanya boleh menampilkan nama variable dan status `SET`/`EMPTY`, bukan nilai
secret. Credential yang tampil di screenshot, log, atau chat harus dianggap compromised.

`LYNK_CHECKOUT_ORDER_REFERENCE_CONFIRMED=true` dan
`LYNK_WEBHOOK_PROVIDER_AUTH_CONFIRMED=true` hanya boleh diaktifkan setelah checkout dan
webhook provider terbukti melalui test nyata/sandbox.

## Verification Dua Domain

```powershell
curl.exe -i https://dev.orviko.net/health
curl.exe -i https://dev.orviko.net/ready
curl.exe https://dev.orviko.net/app/ | Select-String -Pattern '<title>|/app/assets/'
curl.exe -i https://orviko.net/health
curl.exe -i https://orviko.net/ready
curl.exe https://orviko.net/app/ | Select-String -Pattern '<title>|/app/assets/'
```

Expected:

- `/health` dan `/ready` kedua domain mengembalikan `200`;
- `/app/` kedua domain menyajikan Web App shell;
- API dev/prod memakai port yang benar;
- semua API/worker berstatus `active`;
- `nginx -t` sukses;
- tidak ada crash-loop di service atau log error.

## Rollback dan Batasan

Jangan menghapus database, app folder, backup, atau env saat troubleshooting. Simpan log
error dan gunakan backup yang sudah diverifikasi. Jangan menimpa env prod dengan env dev.

Agent boleh melakukan audit, build, migration, backup, restart service, dan reload Nginx
setelah ada otorisasi deployment. Agent tidak boleh meminta private key/secret melalui chat,
mencetak credential, menghapus backup tanpa instruksi, atau menggunakan reset hard tanpa
konfirmasi ketika ada tracked changes.
