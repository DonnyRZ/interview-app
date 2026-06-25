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
