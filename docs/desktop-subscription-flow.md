# Desktop Subscription Flow

Dokumen ini merangkum flow desktop Orviko yang saat ini sudah tervalidasi bekerja di environment dev, plus catatan penting yang sebelumnya sempat menjadi sumber bug.

Tujuannya supaya engineer berikutnya tidak perlu mengulang investigasi dari nol saat menyentuh login desktop, pricing desktop, checkout Lynk.id, webhook subscription, atau session desktop.

## Tujuan Flow

Flow yang diinginkan:

1. User membuka desktop app Orviko.
2. Kalau belum login, desktop menampilkan screen login desktop.
3. User klik `Lanjut`, lalu login Google dilakukan di browser memakai flow auth existing.
4. Setelah login browser sukses, user kembali ke desktop via deep link.
5. Kalau user belum punya subscription aktif, desktop masuk ke pricing desktop.
6. User pilih paket, lalu checkout tetap dibuka di browser memakai Lynk.id.
7. Setelah pembayaran sukses, webhook Lynk.id mengaktifkan subscription di backend Orviko.
8. Desktop polling auth state, mendeteksi subscription aktif, lalu masuk ke workspace utama.
9. Di workspace utama user bisa upload profil, membuat meeting context, memulai live meeting, dan memakai overlay.

## Status Tervalidasi

Flow di atas sudah diuji manual di dev hingga berhasil untuk:

- login desktop
- handoff browser ke Google login
- deep link balik ke desktop
- pricing desktop
- checkout Lynk.id
- webhook aktivasi subscription
- masuk ke workspace utama
- upload profil
- buat meeting context
- mulai live meeting
- memakai floating overlay untuk bantuan jawab

## File Kunci

File yang paling penting untuk dipahami:

- `apps/desktop/src/app/DesktopOnboarding.tsx`
  - auth gate desktop
  - screen login desktop
  - screen pricing desktop
  - polling auth state untuk pindah dari pricing ke home
- `apps/desktop/electron/main.ts`
  - deep link `orviko://...`
  - exchange desktop auth token
  - penyimpanan cookie `orviko_session` di Electron session
  - bridge request desktop yang butuh session auth
- `apps/desktop/electron/preload.cts`
  - expose bridge `window.interviewDesktop.*` ke renderer
- `apps/desktop/src/lib/api-client.ts`
  - semua request workspace desktop harus lewat sini
  - desktop Electron memakai IPC bridge agar cookie session tidak hilang
- `apps/api/src/modules/auth/auth.routes.ts`
  - `/auth/google/login`
  - `/auth/google/callback`
  - `/auth/desktop/exchange`
  - `/auth/me`
- `apps/api/src/modules/auth/session.ts`
  - cookie session `orviko_session`
- `apps/api/src/modules/payments/payment.routes.ts`
  - create checkout Lynk
  - webhook Lynk
- `apps/api/src/modules/payments/payment.service.ts`
  - matching pending payment
  - idempotency webhook
  - aktivasi subscription
- `apps/api/src/modules/payments/lynk.client.ts`
  - parser payload webhook Lynk
  - validasi secret webhook
- `apps/api/src/modules/payments/plan-catalog.ts`
  - nama paket
  - harga paket
  - kuota sesi live

## Flow Teknis Singkat

### 1. Desktop Auth Gate

Desktop app tidak langsung render workspace.

Gate yang dipakai:

- belum login: render login desktop
- sudah login tapi belum punya subscription aktif: render pricing desktop
- sudah login dan subscription aktif: render workspace utama

Auth state desktop dibaca dari Electron main, bukan mengandalkan cookie renderer biasa.

## 2. Login Browser dan Deep Link

Login Google tetap memakai route auth existing.

Desktop membuka:

```txt
/auth/google/login?plan=starter&flow=desktop
```

Setelah login sukses:

- web callback membuat desktop auth token
- browser dibawa ke handoff page
- handoff page mencoba membuka app via deep link `orviko://...`
- desktop menerima token
- desktop memanggil `/auth/desktop/exchange`
- backend mengembalikan `Set-Cookie`
- Electron menyimpan cookie `orviko_session`

## 3. Pricing Desktop

Pricing desktop hanya wrapper flow setelah login.

Poin penting:

- tombol paket tidak boleh membuat payment record palsu sendiri di desktop
- checkout tetap memakai page web existing `checkout.html?plan=...`
- Lynk.id tetap external checkout, bukan custom checkout desktop

## 4. Checkout dan Webhook Lynk.id

Subscription tidak aktif hanya karena user melihat halaman `payment-thankyou` Lynk.id.

Activation yang valid harus datang dari webhook yang cocok dengan pending payment Orviko.

Validasi minimal:

- webhook secret valid
- event dianggap sukses
- transaction id tersedia
- email customer tersedia
- nominal cocok dengan pending payment
- pending payment masih `pending`
- package diambil dari pending payment Orviko, bukan dari nama produk Lynk

Dokumen pendukung:

- `docs/lynk-testing-security.md`

## Bug Penting Yang Sudah Pernah Terjadi

### 1. Session Desktop Lolos Gate, Tapi Workspace Tetap 401

Gejala:

- desktop berhasil keluar dari pricing dan masuk ke workspace
- tapi API workspace seperti `/profile-documents/*` dan `/meeting-contexts/` tetap `401`
- UI menampilkan `Login diperlukan.`

Penyebab:

- auth gate memakai Electron main process dan cookie session Electron
- tapi fetch workspace dari renderer memakai `credentials: include` biasa dari context `file://`
- cookie session tidak ikut terkirim ke API

Perbaikan:

- request workspace desktop harus lewat bridge Electron main
- `apps/desktop/src/lib/api-client.ts` sekarang memakai `window.interviewDesktop.apiRequest(...)`
- Electron main menyisipkan cookie `orviko_session` ke request API

Jangan kembalikan desktop renderer ke fetch langsung kalau request itu butuh session auth.

### 2. Webhook Lynk Masuk, Tapi Email / Transaction / Amount Kosong

Gejala:

- webhook diterima
- `isSuccess: true`
- tetapi activation gagal karena email customer tidak ditemukan atau transaction id kosong

Penyebab:

- payload Lynk nyata ternyata memakai shape `data.message_data.*`
- parser sebelumnya hanya kuat untuk shape generik seperti `customer.email`, `trx_id`, atau `total_amount`

Shape nyata yang pernah muncul di dev:

- `data.message_data.customer.email`
- `data.message_data.customer.name`
- `data.message_data.refId`
- `data.message_data.totals.grandTotal`
- `data.message_data.totals.totalPrice`
- `data.message_data.totals.customerPay`

Perbaikan:

- parser webhook di `lynk.client.ts` sudah mengenali path whitelist tersebut
- test contract sudah mencakup shape payload nyata dari Lynk

Jangan ubah parser menjadi generik terlalu permisif seperti menerima root `id`, `customer.id`, atau `product.id` untuk transaction id.

### 3. Test URL Lynk Berhasil, Tapi Subscription Tidak Aktif

Gejala:

- `Test URL` di dashboard Lynk menghasilkan respons `200`
- namun subscription tidak berubah

Itu normal.

`Test URL` biasanya bukan transaksi sukses sungguhan. Endpoint dan secret bisa valid, tapi payload test tidak mengaktifkan subscription.

Untuk menguji activation, gunakan checkout nyata di dev.

### 4. Test Rp0 Gagal Walau Pembayaran Sukses di Lynk

Penyebab:

- nominal produk Lynk dan nominal pending payment Orviko tidak cocok

Cara aman untuk test:

- pakai override harga dev seperti `ORVIKO_MINI_PRICE=0`
- jangan bypass amount check
- jangan pernah pakai override `0` di production

## Environment Penting

Variable yang paling penting untuk flow ini:

```env
VITE_DESKTOP_API_BASE_URL=https://dev.orviko.net
VITE_DESKTOP_WEB_BASE_URL=https://dev.orviko.net
FRONTEND_BASE_URL=https://dev.orviko.net
GOOGLE_REDIRECT_URI=https://dev.orviko.net/auth/google/callback

LYNK_PROFILE_URL=https://lynk.id/rizki-09
LYNK_MINI_URL=https://lynk.id/rizki-09/...
LYNK_STARTER_URL=https://lynk.id/rizki-09/...
LYNK_PRO_URL=https://lynk.id/rizki-09/...
LYNK_WEBHOOK_SECRET=...
```

Untuk testing dev nominal `Rp0`:

```env
ORVIKO_MINI_PRICE=0
```

Catatan:

- override `Rp0` hanya boleh dipakai di non-production
- production harus tetap memakai harga resmi

## Webhook Lynk.id

URL dev yang dipakai:

```txt
https://dev.orviko.net/payments/lynk/webhook?secret=LYNK_WEBHOOK_SECRET
```

Saat Lynk dashboard menampilkan `Merchant Key`, nilai itu bisa dipakai sebagai shared secret kalau memang dipilih sebagai secret webhook dev.

Saat debugging, pastikan nilai query `secret=` dan env `LYNK_WEBHOOK_SECRET` benar-benar sama persis.

## Checklist Test Manual

Checklist paling penting saat ada perubahan di flow ini:

1. Buka desktop app dalam kondisi fresh.
2. Pastikan screen login desktop muncul.
3. Klik `Lanjut`.
4. Login Google di browser.
5. Pilih `Open Orviko` saat prompt deep link muncul.
6. Pastikan desktop masuk ke pricing kalau user belum punya subscription aktif.
7. Klik salah satu paket.
8. Pastikan checkout web Lynk terbuka dengan paket yang benar.
9. Selesaikan pembayaran.
10. Pastikan webhook tercatat `processed:true`.
11. Pastikan desktop keluar dari pricing dan masuk ke workspace.
12. Upload profil pertama.
13. Pastikan profile processing dan list profile bisa dimuat.
14. Buat meeting context pertama.
15. Mulai live meeting.
16. Buka overlay dan uji minimal satu action bantuan jawab.

## Query dan Log Troubleshooting

Log dev API:

```bash
tail -80 /srv/orviko/dev/logs/api.log
```

Health:

```bash
curl -i https://dev.orviko.net/health
```

Cek user subscription:

```bash
sudo -u postgres psql orviko_dev -c "
select
  email,
  subscription_plan,
  subscription_expires_at,
  subscription_period_started_at
from users
where lower(email)=lower('user@example.com');
"
```

Cek payment:

```bash
sudo -u postgres psql orviko_dev -c "
select
  id,
  order_id,
  plan,
  gross_amount,
  customer_email,
  status,
  external_transaction_id,
  created_at,
  updated_at
from payments
order by created_at desc
limit 20;
"
```

## Reset Dev Untuk Test Ulang Dari Nol

Kalau butuh mengulang flow dari nol dan data dev tidak penting:

```bash
cd /srv/orviko/dev/app
sudo systemctl stop orviko-api-dev

sudo -u postgres dropdb --if-exists orviko_dev
sudo -u postgres createdb orviko_dev

npm run db:migrate

rm -rf /srv/orviko/dev/storage/profile-documents/*
sudo systemctl start orviko-api-dev
curl -i https://dev.orviko.net/health
```

## Batasan Yang Masih Perlu Diingat

- Flow checkout masih external lewat Lynk.id.
- Handoff setelah bayar belum mengandalkan callback browser yang otomatis membuka desktop lagi dari Lynk thank-you page. Desktop saat ini aman karena polling auth/subscription state setelah webhook sukses.
- Test dev `Rp0` berguna untuk workflow, tetapi bukan pengganti test nominal nyata untuk validasi bisnis akhir.

## Prinsip Yang Jangan Dilanggar

- Jangan aktifkan subscription hanya dari halaman thank-you Lynk.
- Jangan bypass webhook matching.
- Jangan aktifkan subscription dari nama produk Lynk.
- Jangan pakai parser webhook yang terlalu permisif.
- Jangan kembalikan request desktop workspace ke fetch renderer biasa untuk endpoint yang butuh session.
- Jangan hidupkan override harga `Rp0` di production.

## Ringkasan Mental Model

Cara paling aman memahami sistem ini:

- browser menangani login Google dan checkout Lynk
- backend menangani source of truth auth, payment, dan subscription
- desktop menangani auth gate, session bridge, dan workspace UI
- Electron main adalah jembatan session yang membuat desktop renderer bisa bicara ke backend sebagai user yang sama

Kalau salah satu bagian flow terlihat aneh, biasanya masalah jatuh ke salah satu dari empat kategori:

- deep link / desktop auth exchange
- cookie session Electron
- pending payment dan webhook Lynk
- request workspace desktop yang tidak melewati session bridge
