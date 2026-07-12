# Panduan Migrasi Payment Gateway

Dokumen ini adalah runbook untuk mengganti Lynk.id, yang saat ini dipakai sebagai MVP,
dengan payment gateway resmi. Tujuannya adalah mengganti provider tanpa mengubah aturan
subscription, quota, refund, chargeback, dan ownership user.

## Kondisi Saat Ini

Core payment sudah provider-neutral:

- Frontend membuat checkout melalui `POST /payments/create`.
- Endpoint lama `POST /payments/lynk/create` tetap tersedia sebagai compatibility alias.
- State machine payment berada di `handleVerifiedPaymentEvent`.
- Adapter provider menormalisasi webhook menjadi `VerifiedPaymentProviderEvent`.
- `payment_intents` menyimpan snapshot plan, amount, currency, product, order, dan provider.
- `payment_events` menjadi ledger idempotent berdasarkan `provider` + `provider_event_id`.
- `provider_payment_id` di `payment_intents` mengikat payment provider ke intent secara unik.

Referensi implementasi:

- `apps/api/src/modules/payments/payment-provider.ts`
- `apps/api/src/modules/payments/payment.service.ts`
- `apps/api/src/modules/payments/payment.routes.ts`
- `apps/api/src/db/schema/payment-intents.ts`
- `apps/api/src/db/schema/payment-events.ts`

## Tahap 1: Pilih Provider dan Model Checkout

Sebelum coding, dokumentasikan keputusan berikut:

- nama provider internal, misalnya `midtrans` atau `xendit`;
- mode checkout: hosted redirect, embedded checkout, atau payment link;
- identifier order yang dapat dibuat Orviko dan dikembalikan provider;
- identifier payment yang stabil untuk satu transaksi;
- identifier event webhook yang unik;
- daftar status paid, failed, expired, refunded, dan chargeback;
- dukungan refund dan chargeback;
- currency dan metode pembayaran yang tersedia;
- format signature webhook dan cara validasi raw request body.

Jangan memakai email, nominal, nama produk, atau timestamp sebagai pengganti order ID.

## Tahap 2: Siapkan Credential

Buat credential terpisah untuk development dan production. Simpan hanya di environment
server, bukan di repository atau frontend.

Contoh konfigurasi yang perlu disediakan, sesuaikan nama dengan provider:

```env
PAYMENT_PROVIDER=gateway-name
GATEWAY_SERVER_KEY=...
GATEWAY_CLIENT_KEY=...
GATEWAY_WEBHOOK_SECRET=...
GATEWAY_WEBHOOK_AUTH_CONFIRMED=false
```

Credential production tidak boleh dipakai untuk test lokal. Tambahkan validasi startup yang
menolak environment production jika credential, callback, atau webhook authentication
belum lengkap.

## Tahap 3: Implementasikan Adapter Provider

Buat file client baru, misalnya `gateway-name.client.ts`. Adapter hanya boleh menangani
detail provider:

1. Membuat checkout dengan `providerOrderId` yang sudah dibuat backend.
2. Menggunakan harga dan currency dari backend, bukan dari request frontend.
3. Mengembalikan checkout URL atau token yang aman untuk client.
4. Memvalidasi signature webhook terhadap raw body.
5. Memetakan payload provider ke bentuk berikut:

```ts
{
  provider: "gateway-name",
  providerEventId: "...",
  providerPaymentId: "...",
  providerOrderId: "ORVIKO-...",
  providerProductId: "...", // optional bila provider tidak mengirimkannya
  customerEmail: "...",     // optional bila provider tidak mengirimkannya
  eventType: "paid",        // paid | failed | expired | refunded | chargeback
  amount: 98000,
  currency: "IDR",
  sanitizedPayload: {}
}
```

Setelah signature dan field wajib diverifikasi, teruskan hasilnya ke
`handleVerifiedPaymentEvent`. Jangan menyalin logic aktivasi subscription ke adapter.

## Tahap 4: Hubungkan Checkout

Pertahankan endpoint provider-neutral `POST /payments/create`. Ubah implementasi active
provider di backend agar:

- membuat `payment_intent` dengan `provider: "gateway-name"`;
- menyimpan `providerOrderId` dan `providerProductId`;
- menyimpan snapshot `plan`, `amount`, `currency`, dan `customerEmail`;
- menyimpan checkout URL/token provider yang tidak sensitif;
- menetapkan `expiresAt`;
- tidak menerima amount, currency, atau product ID dari frontend.

Endpoint `/payments/lynk/create` tetap dipertahankan sampai semua client dan environment
sudah berpindah. Jangan menghapus konfigurasi Lynk sebelum migration window selesai.

## Tahap 5: Daftarkan Webhook

Urutan konfigurasi yang disarankan:

1. Daftarkan URL webhook development.
2. Aktifkan signature/authentication provider.
3. Pastikan server membaca raw request body sebelum parsing JSON jika signature memerlukannya.
4. Tolak request tanpa signature atau dengan signature tidak valid menggunakan HTTP 401.
5. Pastikan provider mengirim kembali `providerOrderId`.
6. Pastikan event ID dan payment ID stabil saat webhook di-retry.
7. Setelah test berhasil, daftarkan URL production.

Webhook wajib memverifikasi minimal:

- provider order ID cocok dengan `payment_intents`;
- amount dan currency cocok dengan snapshot intent;
- product ID cocok jika provider mengirimkannya;
- email cocok jika provider mengirimkannya;
- payment ID tidak berubah untuk intent yang sama;
- event ID belum pernah diproses.

Event yang gagal validasi harus masuk ke ledger sebagai rejected bila sudah terautentikasi,
tanpa mengaktifkan subscription.

## Tahap 6: Database dan Backfill

Migration `0012_payment_provider_abstraction.sql` sudah menyediakan korelasi
`provider_payment_id` dan indeks pending expiry. Biasanya tidak perlu mengubah tabel saat
menambahkan provider baru.

Sebelum production:

- pastikan semua intent lama memiliki `provider = 'lynk'`;
- jangan mengubah history `payment_events` Lynk;
- jangan mengganti provider pada intent yang sudah dibuat;
- payment baru memakai provider baru hanya setelah feature flag diaktifkan;
- siapkan query audit untuk intent tanpa provider payment ID dan event rejected.

Jika gateway membutuhkan field baru, tambahkan migration backward-compatible. Jangan
menghapus field Lynk pada migration awal.

## Tahap 7: Testing Wajib

Tambahkan fixture provider baru tanpa memanggil API production. Minimal test harus mencakup:

- checkout menyimpan order reference backend;
- amount atau currency yang diubah ditolak;
- order ID yang tidak dikenal ditolak;
- payment ID berbeda pada order yang sama ditolak;
- webhook signature salah atau hilang ditolak;
- event yang sama di-replay secara idempotent;
- paid mengaktifkan subscription satu kali;
- paid kedua tidak menggandakan period;
- refund mencabut payment sumber yang benar;
- refund payment lama tidak mencabut renewal terbaru;
- chargeback diproses sesuai state transition;
- event tanpa product/email dapat diproses hanya jika provider memang tidak menyediakannya;
- Lynk regression test tetap lulus.

Perintah minimum:

```powershell
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd --workspace @interview-app/api run test:auth-payment
npm.cmd --workspace @interview-app/api run test:data-integrity
npm.cmd --workspace @interview-app/api run test:data-integrity-db
npm.cmd run build
```

## Tahap 8: Rollout Aman

Gunakan rollout bertahap:

1. Deploy adapter dan migration tanpa mengubah provider aktif.
2. Jalankan test webhook sandbox provider baru.
3. Aktifkan provider baru untuk internal/test user melalui feature flag.
4. Pantau payment intent, webhook rejected, subscription activation, refund, dan chargeback.
5. Aktifkan provider baru untuk user baru.
6. Biarkan intent lama tetap diproses oleh provider asalnya.
7. Pertahankan Lynk untuk recovery sampai seluruh intent pending Lynk selesai atau expire.
8. Setelah stabil, nonaktifkan checkout Lynk baru, tetapi tetap pertahankan webhook dan
   reconciliation untuk history Lynk.

Jangan melakukan hard switch yang membuat payment intent Lynk lama tidak dapat menerima
refund, chargeback, atau webhook retry.

## Release Gate

Migrasi gateway boleh dinyatakan siap hanya jika semua kondisi berikut terpenuhi:

- signature webhook provider baru terverifikasi server-side;
- order reference provider terbukti kembali pada webhook nyata/sandbox;
- payment ID dan event ID terbukti stabil saat retry;
- seluruh state transition subscription lulus integration test;
- Lynk regression test tetap lulus;
- migration dapat dijalankan ulang tanpa error;
- tidak ada secret provider di frontend, log, atau repository;
- ada rollback plan yang mempertahankan pemrosesan intent Lynk lama.

Detail invariant payment dan aturan production ada di
`docs/payment-production-integrity.md`.
