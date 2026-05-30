# Midtrans Sandbox Review Flow

Dokumen ini mencatat flow sementara yang dipakai hanya untuk proses review Midtrans sandbox.

Flow login dan checkout yang akan dibuat pada tahap ini bukan flow production final Orviko. Tujuannya adalah membuat reviewer Midtrans bisa membuka halaman pricing, memilih paket, login dengan Google, lalu masuk ke checkout/payment sandbox dengan langkah yang sederhana dan mudah diverifikasi.

## Scope Sementara

- User membuka web pricing Orviko.
- User memilih paket dari halaman pricing.
- User login dengan Google melalui flow web.
- Setelah login, user diarahkan ke halaman checkout/payment.
- Pembayaran diproses melalui Midtrans sandbox.

Flow ini sengaja dibuat lebih langsung agar proses review Midtrans tidak perlu bergantung pada instalasi desktop app, Microsoft Store, atau deep link dari aplikasi desktop.

## Bukan Flow Production Final

Saat Orviko sudah masuk production sebenarnya, flow yang diinginkan adalah:

- User download desktop app Orviko melalui Microsoft Store.
- User login dari aplikasi desktop.
- Dari aplikasi desktop, user diarahkan ke web pricing atau checkout.
- Web pricing/checkout membaca konteks akun dari flow desktop yang valid.
- Payment production berjalan dengan integrasi akun dan entitlement yang lebih lengkap.

Karena flow production tersebut belum dibangun, flow web-only untuk Midtrans sandbox ini dianggap temporary.

## Catatan Penting

- Jangan jadikan flow sandbox ini sebagai sumber kebenaran desain auth/payment production.
- Jangan menambahkan asumsi bahwa web pricing adalah satu-satunya entrypoint checkout production.
- Setelah review Midtrans selesai dan flow production siap, implementasi sementara beserta referensi temporary yang tidak lagi dipakai harus dihapus.
- Folder `Temp-Reference/` hanya dipakai sebagai referensi sementara selama development dan wajib dibersihkan setelah implementasi Gmail login serta Midtrans sandbox selesai.
