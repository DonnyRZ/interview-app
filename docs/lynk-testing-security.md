# Lynk.id Testing Security

Dokumen ini menjelaskan kenapa pembayaran test Lynk.id dengan nominal berbeda bisa gagal, dan bagaimana cara testing yang aman tanpa melemahkan validasi subscription Orviko.

## Ringkasan

Checkout aktif Orviko memakai Lynk.id. Namun subscription Orviko tidak boleh aktif hanya karena user berhasil melihat halaman `payment-thankyou` Lynk.id.

Backend Orviko harus tetap mencocokkan webhook Lynk dengan pending payment yang dibuat oleh Orviko.

Validasi minimal yang harus cocok:

- Email customer Lynk cocok dengan akun Orviko.
- Transaction ID Lynk tersedia dan belum pernah diproses.
- Nominal webhook Lynk sama dengan nominal pending payment Orviko.
- Pending payment masih berstatus `pending`.
- Paket subscription diambil dari pending payment Orviko, bukan dari nama produk Lynk.

## Kenapa Test Rp0 Bisa Gagal

Contoh kasus:

- Produk Mini di Lynk.id dibuat sementara menjadi `Rp0`.
- Orviko masih mencatat paket Mini sebagai `Rp29rb`.
- User memilih paket Mini dari Orviko.
- Orviko membuat pending payment Mini senilai `Rp29rb`.
- User membayar checkout Lynk.id senilai `Rp0`.
- Webhook Lynk masuk ke Orviko.
- Backend menolak aktivasi subscription karena nominal `Rp0` tidak cocok dengan pending payment `Rp29rb`.

Ini adalah perilaku yang benar secara security.

Kalau nominal tidak wajib cocok, orang bisa mengaktifkan paket berbayar menggunakan transaksi yang tidak sesuai.

## Cara Testing Dev Yang Aman

Untuk testing tanpa bayar asli, jangan mematikan validasi nominal.

Gunakan price override khusus environment dev/staging, misalnya:

```env
ORVIKO_MINI_PRICE=0
```

Dengan begitu:

- Orviko mencatat pending payment Mini sebagai `Rp0`.
- Lynk.id mengirim webhook transaksi Mini `Rp0`.
- Nominal tetap cocok.
- Validasi security tetap berjalan.
- Production tetap memakai harga asli.

Price override `Rp0` hanya boleh dipakai di environment non-production. Backend akan menolak start jika `NODE_ENV=production` memakai override harga `0`.

## Hal Yang Tidak Boleh Dilakukan

Jangan lakukan hal-hal ini hanya agar testing lebih cepat:

- Jangan bypass amount check.
- Jangan mengaktifkan subscription hanya dari nama produk Lynk.
- Jangan menganggap halaman `payment-thankyou` Lynk sebagai bukti final di backend.
- Jangan mengaktifkan subscription tanpa transaction ID.
- Jangan membuat route manual untuk langsung mengubah user menjadi paid.
- Jangan memakai price override `Rp0` di production.

## Flow Valid

Flow yang dianggap valid:

1. User login Orviko.
2. User memilih paket dari desktop/web Orviko.
3. Orviko membuat pending payment.
4. User diarahkan ke checkout Lynk.id.
5. User menyelesaikan pembayaran di Lynk.id.
6. Lynk.id mengirim webhook ke Orviko.
7. Backend Orviko mencocokkan webhook dengan pending payment.
8. Jika semua cocok, subscription user aktif.

## Webhook Test URL

Lynk.id punya fitur `Test URL`, tetapi payload test biasanya bukan transaksi sukses.

Respons seperti ini berarti endpoint dan secret sudah benar, tetapi payload test memang tidak mengaktifkan subscription:

```json
{
  "ok": true,
  "processed": false,
  "reason": "Webhook Lynk diterima, tetapi belum terdeteksi sebagai transaksi sukses."
}
```

Untuk menguji aktivasi subscription, gunakan transaksi checkout asli di environment dev/staging dengan nominal yang cocok dengan pending payment Orviko.

## Production Rule

Production harus tetap memakai harga resmi paket:

- Mini: `Rp29rb`
- Starter: `Rp98rb`
- Pro: `Rp359rb`

Jika ada kebutuhan testing `Rp0`, lakukan hanya di dev/staging dengan konfigurasi environment yang eksplisit dan mudah diaudit.
