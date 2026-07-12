# Payment Production Integrity

Payment di environment development dan production memakai kontrak keamanan yang sama.
Tidak ada auto-approve, webhook tanpa autentikasi, atau korelasi berdasarkan email dan
nominal saja.

## Source of truth

`plan-catalog.ts` menyimpan harga, currency, periode, kuota, checkout URL, dan provider
product ID. Frontend hanya memilih plan slug; backend membuat snapshot nilai tersebut
di `payment_intents`.

## Checkout

Sebelum redirect, backend membuat payment intent yang berisi:

- public payment ID;
- user pemilik;
- provider order reference;
- provider product ID;
- exact amount dan currency;
- expiry;
- plan snapshot.

Provider harus mengembalikan order reference tersebut pada webhook. Jika checkout Lynk
tidak dapat membawa dan mengembalikan reference itu, integrasi Lynk belum memenuhi
release gate production.

## Webhook

- Query-string secret tidak didukung.
- Header secret wajib pada seluruh environment.
- Production juga mewajibkan `LYNK_WEBHOOK_PROVIDER_AUTH_CONFIRMED=true`.
- Flag tersebut hanya boleh diaktifkan setelah Lynk mengonfirmasi mekanisme autentikasi
  webhook yang dipakai. Jika tersedia signature resmi, verifier harus diganti dengan
  signature verifier atas raw request body.
- Event wajib cocok pada order reference, product ID, amount, dan currency.
- Event ID disimpan unik untuk mencegah replay.
- Payload penuh, email customer, dan internal user ID tidak disimpan di event ledger.

## Subscription

Payment `paid` membuat atau memperpanjang subscription dan period. Refund atau
chargeback mencabut subscription aktif serta compatibility projection pada tabel users.
Pending intent yang melewati expiry ditandai expired.

## Release gate

Payment production tetap NO-GO sampai checkout nyata terbukti mengembalikan provider
order reference dan Lynk mengonfirmasi autentikasi webhook yang dapat diverifikasi
server-side.

Konfigurasi checkout wajib menetapkan `LYNK_CHECKOUT_ORDER_REFERENCE_PARAM`. Backend
menambahkan `providerOrderId` unik ke parameter tersebut sebelum redirect. Setelah satu
checkout nyata membuktikan nilai itu kembali tanpa berubah pada webhook, set
`LYNK_CHECKOUT_ORDER_REFERENCE_CONFIRMED=true`. Production menolak start selama flag
konfirmasi reference atau autentikasi webhook masih `false`.

Refund dan chargeback dicocokkan ke payment intent sumber. Event payment lama tidak boleh
mencabut subscription terbaru yang berasal dari renewal/payment intent lain.

## Migrasi payment gateway

Lynk adalah adapter provider sementara. State machine payment dan entitlement menerima
`VerifiedPaymentProviderEvent`, sehingga integrasi gateway baru tidak boleh menduplikasi
logika aktivasi, renewal, refund, atau chargeback.

Adapter gateway baru hanya bertanggung jawab untuk:

- membuat checkout provider dengan `providerOrderId` dari Orviko;
- memverifikasi signature webhook menggunakan raw request body;
- menormalisasi event terverifikasi ke kontrak provider-neutral;
- meneruskan event ke `handleVerifiedPaymentEvent`.

Frontend menggunakan endpoint provider-neutral `POST /payments/create`. Endpoint lama
`POST /payments/lynk/create` dipertahankan selama masa transisi agar integrasi Lynk yang
sudah berjalan tidak rusak.

`payment_intents` menyimpan pasangan unik provider/order serta provider/payment ID.
`payment_events` tetap menjadi ledger idempotent berdasarkan provider/event ID. Product ID,
amount, currency, dan email adalah snapshot checkout; adapter boleh tidak mengirim product
atau email hanya jika gateway memang tidak menyediakannya, tetapi amount dan currency tetap
wajib diverifikasi oleh core.
