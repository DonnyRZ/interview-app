# Audit Menyeluruh Orviko Web App

Tanggal audit: 24 Juni 2026  
Branch: `dev`  
Commit baseline: `23c0747` — `Route pricing CTAs through plan-aware login flow`

## 1. Executive Summary

Orviko belum aman untuk masuk production.

Audit menemukan blocker pada enam area utama:

1. Data pribadi pengguna tersimpan di Git dan histori Git.
2. Web App belum benar-benar tersedia melalui route production `/app/`.
3. Webhook pembayaran belum memiliki autentikasi dan korelasi transaksi yang cukup kuat.
4. Pricing model tidak konsisten dengan harga dan kuota yang dijual aplikasi.
5. Belum ada kontrol biaya AI yang memadai.
6. Retensi dan penghapusan data belum memenuhi perilaku yang dijelaskan kepada pengguna.

Selain itu ditemukan kelemahan pada OAuth, session management, subscription lifecycle, database migration, dependency security, deployment, observability, accessibility, performa landing page, dan cakupan automated test.

Status rekomendasi:

> Jangan deploy ke production sebelum seluruh temuan Critical dan High ditangani serta checkout nyata dan Web App production diuji end-to-end.

## 2. Scope Audit

Area yang diperiksa:

- Seluruh aturan dan dokumentasi `.md` dalam repository.
- Struktur `apps/api`, `apps/web`, `apps/web-app`, `packages/shared`, database schema, migration, dan konfigurasi root.
- Alur landing page, pricing, Google login, checkout Lynk, webhook, aktivasi subscription, dan akses Web App.
- Isolasi data antar-user.
- Manipulasi harga, paket, payment ID, user ID, dan webhook.
- Session, OAuth state, cookie, CORS, dan development bypass.
- Profile document, meeting context, live meeting, Realtime, audio capture, transcription, dan bantuan AI.
- Token usage, rate limit, retry, context size, dan pricing model.
- Privacy, data retention, account deletion, logging, dan file storage.
- Dependency, license, build, typecheck, contract test, database test, dan browser smoke test.
- Konfigurasi deployment, Nginx, TLS, health check, database, backup, CI/CD, dan observability.
- Landing page, pricing page, checkout, legal page, accessibility dasar, performa, dan SEO dasar.

Audit tidak mengubah source file. Pengujian database yang menghasilkan data sementara sudah dibersihkan.

## 3. Ringkasan Severity

### Critical

- Dua CV pengguna tersimpan dan terlacak di Git beserta histori commit.
- Development authentication bypass dapat mengakses fixed development user tanpa cookie pada environment non-production.
- Webhook Lynk belum memakai signature provider dan dapat diterima tanpa secret pada development.
- Tidak ada rate limit atau kontrol biaya pada endpoint dan Realtime usage.
- Route `/app/` belum menyajikan Web App sesuai flow login.
- Dependency audit menemukan satu vulnerability Critical.

### High

- CORS menerima origin apa pun dengan credentials.
- Pricing workbook, aplikasi, dan kuota produk tidak konsisten.
- Pro dijual unlimited tanpa fair-use enforcement atau cap biaya.
- Profile dan meeting-context preprocessing berbayar tidak membutuhkan subscription aktif.
- OAuth state dapat digunakan ulang dan tidak terikat ke browser pemulai login.
- Session stateless 14 hari tidak dapat dicabut server-side.
- Refund dan chargeback tidak mencabut subscription.
- Database migration production-readiness belum sinkron.
- Responses API belum menggunakan `store: false`.
- Tidak ada durasi maksimum meeting, batas sesi aktif, atau batas client secret.
- Health endpoint tidak memeriksa database maupun dependency.
- Security headers publik tidak memadai.

### Medium

- Validasi upload PDF hanya berdasarkan MIME client.
- Background AI processing tidak durable.
- Retry processing tidak memiliki lock atau deduplication.
- Input text dan list endpoint tidak memiliki limit/pagination memadai.
- Full transcript yang disimpan hanya 20 turn terakhir.
- Keyword AI dibuat otomatis meskipun belum diminta pengguna.
- WebSocket dipakai di browser meskipun WebRTC lebih direkomendasikan.
- Landing page memiliki klaim performa dan kompatibilitas yang belum terbukti.
- Legal page masih memiliki placeholder.
- Checkout mempunyai latent DOM-XSS sink.
- Accessibility dan performa landing page belum memenuhi baseline yang baik.

## 4. Temuan Critical

### 4.1 Data CV Pengguna Tersimpan di Git

File berikut terlacak oleh Git:

- `storage/profile-documents/1780372421397-d2709ff2-2054-4cf7-a75b-0994f20a39d8-CV-Donny-Santosa.pdf`
- `storage/profile-documents/1782048576080-2a33957f-f693-494f-a510-77b296267c7b-CV-Donny-Santosa__5_.pdf`

File tersebut juga sudah masuk histori Git:

- Commit `a300938` menambahkan CV pertama.
- Commit `58cdbec` menambahkan CV kedua.

`.gitignore` hanya mengabaikan `storage/cvs/*`, tetapi tidak mengabaikan `storage/profile-documents/**`.

Dampak:

- Data pribadi tetap dapat dipulihkan dari histori walaupun file dihapus pada commit baru.
- Siapa pun yang memiliki akses repository dapat memperoleh CV tersebut.
- Repository tidak aman untuk dibuka, dipindahkan, atau dibagikan sebelum histori dibersihkan.

Rekomendasi:

1. Hapus seluruh profile document dari Git.
2. Tambahkan `storage/profile-documents/**` ke `.gitignore`.
3. Bersihkan histori menggunakan `git filter-repo` atau prosedur setara.
4. Force-push hanya setelah koordinasi dengan seluruh pengguna repository.
5. Rotasi repository clone yang pernah menerima file tersebut.
6. Tetapkan storage di luar repository deployment.

### 4.2 Sample Audio Terlacak di Git

File berikut terlacak:

- `Price-Calc/sample-audio/demo orviko awal.MP3`
- Ukuran sekitar 12,1 MB.

Isi audio tidak diaudit untuk melindungi privasi. Kepemilikan, izin penggunaan, dan sensitivitas kontennya belum dibuktikan.

Rekomendasi:

- Klasifikasikan isi dan hak penggunaannya.
- Hapus dari Git/history bila berisi suara atau percakapan pribadi.
- Simpan fixture pengujian berupa synthetic audio yang tidak mengandung data nyata.

### 4.3 Development Authentication Bypass

`apps/api/src/modules/dev/local-web-testing.ts` memperlakukan request sebagai fixed development user apabila:

- `NODE_ENV !== "production"`.
- Header `x-orviko-local-testing` bernilai `web-app`.
- Origin menggunakan hostname `localhost`, `127.0.0.1`, atau `::1`.

Port origin tidak dibatasi.

Pengujian lokal membuktikan bahwa endpoint profile document dapat diakses tanpa cookie menggunakan header tersebut.

Deployment publik `dev.orviko.net` yang diuji mengembalikan `401`, sehingga bypass publik tidak terbukti aktif. Namun source code tetap berbahaya jika environment dev dapat dijangkau publik atau proxy meneruskan Origin/header tersebut.

Rekomendasi:

- Hapus bypass dari aplikasi utama.
- Bila tetap diperlukan, gunakan build flag eksplisit yang tidak tersedia di deployment.
- Ikat ke process khusus test, bukan request header.
- Jangan pernah menjalankan environment dengan bypass pada host yang dapat diakses jaringan.

### 4.4 Webhook Lynk Belum Terautentikasi dengan Kuat

Webhook hanya dibandingkan dengan shared secret dari:

- Header `x-orviko-lynk-webhook-secret`; atau
- Query parameter `?secret=...`.

Masalah:

- Secret pada query masuk access log Nginx/Fastify.
- Tidak ada provider signature.
- Tidak ada timestamp atau replay protection.
- Tidak ada raw-body signature verification.
- Bila `LYNK_WEBHOOK_SECRET` kosong dan environment bukan production, semua webhook diterima.
- Parser status dan payload sangat permisif.

Pengujian lokal dengan webhook tanpa secret menghasilkan HTTP `200` karena environment development tidak memiliki secret.

Rekomendasi:

1. Gunakan signature resmi provider atas raw body.
2. Tolak webhook tanpa signature, termasuk di dev bersama.
3. Verifikasi timestamp dan batas replay.
4. Jangan menerima secret melalui query.
5. Simpan event ID dan status pemrosesan untuk idempotency serta rekonsiliasi.
6. Gunakan HTTP non-2xx jika autentikasi atau bentuk event tidak valid.

### 4.5 Tidak Ada Rate Limit dan Cost Control

Tidak ditemukan:

- Per-user rate limit.
- Per-IP rate limit.
- Batas request AI per periode.
- Batas token.
- Batas meeting duration.
- Batas jumlah koneksi Realtime.
- Batas jumlah sesi aktif.
- Batas client secret per sesi.
- Fair-use enforcement untuk Pro.

Profile upload, retry preprocessing, dan meeting-context preprocessing juga dapat memicu request berbayar tanpa subscription aktif.

Dampak:

- Abuse atau bug frontend dapat menghabiskan budget API.
- Satu user Pro dapat membuat biaya tidak terbatas.
- Satu paid user dapat membuka banyak koneksi Realtime paralel.
- Automatic retries dapat menambah biaya ketika kapasitas sudah tertekan.

Rekomendasi:

- Terapkan quota dan rate limit pada seluruh endpoint mahal.
- Batasi satu active meeting per user untuk MVP.
- Batasi satu Realtime secret aktif per session.
- Tetapkan durasi meeting maksimum.
- Tetapkan click/token budget per session.
- Terapkan fair-use cap yang eksplisit untuk Pro.
- Persist usage dan biaya per user/session.

### 4.6 Route Web App Production Belum Benar

Flow Google login untuk `flow=web-app` mengarahkan pengguna ke:

```text
${FRONTEND_BASE_URL}/app/
```

Namun:

- `apps/web-app/vite.config.ts` tidak memiliki `base: "/app/"`.
- Production build menghasilkan asset `/assets/...`, bukan `/app/assets/...`.
- `docs/VPS.md` hanya mendokumentasikan Nginx root untuk `apps/web/dist`.
- Tidak ada alias/deployment untuk `apps/web-app/dist`.
- Pengujian lokal `/app/` membuka landing page, bukan React Web App.

Rekomendasi:

1. Pilih strategi deployment final:
   - Web App pada `/app/`; atau
   - Subdomain khusus.
2. Sesuaikan Vite base.
3. Tambahkan Nginx alias dan SPA fallback.
4. Pastikan cookie, callback OAuth, API base, asset, dan AudioWorklet bekerja dari route tersebut.
5. Tambahkan production smoke test yang memastikan `/app/` mengandung root Web App.

### 4.7 Dependency Vulnerability

Hasil `npm audit`:

- Total: 9 vulnerability.
- Critical: 1.
- High: 3.
- Moderate: 4.
- Low: 1.

Komponen utama:

- `shell-quote`: Critical, transitive melalui tooling database.
- `drizzle-orm` 0.38.4: High.
- `vite` 6.4.2: High.
- `fast-uri`: High/transitive.
- `esbuild` dan `drizzle-kit`: Moderate.

Catatan:

- Drizzle saat ini menggunakan identifier statis sehingga immediate exploit lebih sempit.
- Vite adalah tooling development dan bind ke localhost.
- Risiko tetap perlu ditutup sebelum production.

## 5. Authentication dan Session

### 5.1 OAuth State Dapat Digunakan Ulang

OAuth state:

- Ditandatangani.
- Memiliki expiry 10 menit.
- Mengandung nonce.

Namun nonce tidak pernah disimpan atau ditandai sebagai sudah digunakan. State yang sama berhasil diparse berulang kali.

Risiko:

- Login CSRF.
- Account/session confusion.
- Replay callback dalam window expiry.

Rekomendasi:

- Simpan state/nonce server-side atau signed HttpOnly cookie yang terikat ke browser pemulai.
- Hapus state setelah callback berhasil/gagal.
- Tambahkan PKCE.

### 5.2 Session Tidak Dapat Dicabut

Session berupa signed token dengan masa berlaku 14 hari.

Tidak ada:

- `jti`.
- Session table.
- Session version pada user.
- Revocation list.
- Device/session management.

Logout hanya menghapus cookie pada browser saat ini. Token yang telah dicuri tetap valid sampai expiry.

Rekomendasi:

- Gunakan opaque server-side session atau tambahkan revocable session ID.
- Rotasi token setelah login sensitif.
- Sediakan revoke-all-sessions.
- Gunakan cookie prefix `__Host-` pada production.

### 5.3 Google Account Linking

User existing dicari menggunakan:

```text
googleSub == sub OR email == email
```

Kelemahan:

- `email_verified` tidak diperiksa.
- Account dapat dihubungkan ulang berdasarkan email.
- Case normalization tidak dilakukan eksplisit ketika upsert.

Rekomendasi:

- Wajibkan `email_verified=true`.
- Link berdasarkan provider subject setelah initial verified-email association.
- Normalisasi email.
- Audit perubahan Google subject sebagai event keamanan.

### 5.4 OAuth Meminta Offline Access yang Tidak Digunakan

Google OAuth memakai:

- `access_type=offline`
- `prompt=consent`

Refresh token tidak digunakan.

Dampak:

- Consent screen muncul lebih sering.
- Scope/credential lifecycle lebih besar dari kebutuhan.

## 6. User Isolation dan Authorization

Hal yang sudah benar:

- Profile document query dibatasi dengan user ID session.
- Meeting context query dibatasi user.
- Live session query dibatasi user.
- Payment GET dibatasi user.
- Cross-user payment ID menghasilkan `404`.
- Cross-user profile/context/session test berhasil.
- Harga dan target user tidak dipercayai dari request client.

Kelemahan:

- Dev bypass melewati identitas asli.
- Profile/context AI processing hanya membutuhkan login, bukan active subscription.
- Subscription hanya dicek ketika live start dan client-secret.
- Subscription tidak diperiksa ulang di tengah sesi.

## 7. Payment dan Subscription

### 7.1 Server-Authoritative Price Sudah Benar

Client hanya mengirim plan slug. Backend menetapkan:

- Harga.
- User ID.
- Order ID.
- Email customer.

Pengujian request yang mencoba mengirim harga `0` dan user ID lain tetap menghasilkan payment senilai harga server untuk session user.

### 7.2 Korelasi Payment Terlalu Lemah

Webhook payment dicocokkan menggunakan:

- Email customer.
- Nominal.
- Pending status.
- Pending payment terbaru.

Tidak menggunakan:

- Order ID Orviko.
- Product ID Lynk.
- Plan/product mapping provider.
- Currency.
- Checkout expiration.

Risiko:

- Dua checkout nominal sama dapat tertukar.
- Payment lama dapat mengaktifkan paket setelah harga berubah.
- Payment dari produk lain dengan email dan nominal sama dapat salah cocok.

### 7.3 Currency Tidak Diverifikasi

Payment database memiliki currency default `IDR`, tetapi webhook parser tidak memverifikasi currency.

### 7.4 Negative Amount Parsing Tidak Aman

Parser string nominal menghapus seluruh karakter selain digit. Tanda minus juga dihapus.

Contoh konseptual:

```text
-98000 -> 98000
```

### 7.5 Refund dan Chargeback Tidak Ditangani

Event refund, chargeback, failure, atau expiration hanya menghasilkan `processed:false`.

Tidak ada:

- Update status payment.
- Subscription suspension/revocation.
- Audit event.
- Alert manual.

### 7.6 Pending Payment Tidak Pernah Expire

Database lokal memiliki lima pending payment berumur lebih dari 24 jam.

Tidak ada cleanup/reconciliation job.

### 7.7 Checkout Dapat Dibuat Tanpa Batas

User dapat membuat pending payment berulang kali sehingga:

- Database dapat dipenuhi record.
- Korelasi webhook makin ambigu.
- Pengalaman checkout membingungkan.

### 7.8 Renewal dan Quota Period Tidak Konsisten

Jika subscription masih aktif:

- Expiry diperpanjang dari expiry lama.
- `subscriptionPeriodStartedAt` direset ke waktu pembayaran sekarang.

Akibatnya pengguna dapat memiliki masa berlaku lebih dari 30 hari tetapi hanya satu quota period yang dihitung sejak pembayaran terakhir.

Upgrade, downgrade, carry-over, proration, dan quota reset belum didefinisikan.

### 7.9 Payment Response Mengekspos Internal User ID

`mapPayment()` mengembalikan `userId` internal walaupun frontend tidak membutuhkannya.

### 7.10 Raw Notification dan PII

Seluruh payload webhook disimpan di `rawNotification`.

Payload provider berpotensi mengandung:

- Nama.
- Email.
- Nomor telepon.
- Alamat.
- Metadata checkout.

Tidak ada:

- Field allowlist.
- Encryption at application layer.
- Retention schedule.
- Redaction.

## 8. Pricing dan Unit Economics

### 8.1 Ketidaksesuaian Harga Pro

Aplikasi:

- Mini: Rp29.000.
- Starter: Rp98.000.
- Pro: Rp359.000.

Pricing workbook:

- Mini: Rp29.000.
- Starter: Rp98.000.
- Pro: Rp379.000.

### 8.2 Ketidaksesuaian Kuota

Aplikasi:

- Mini: 3 sesi.
- Starter: 12 sesi.
- Pro: unlimited.

Workbook:

- Mini recommended: 3.
- Starter recommended: 11.
- Pro recommended: 43.

Dengan demikian harga dan entitlement yang dijual tidak sesuai capacity model.

### 8.3 Formula Margin Salah Label

Workbook menyebut target gross margin 30%, tetapi menghitung:

```text
AI cost share = 1 / (1 + target margin)
```

Formula tersebut merepresentasikan markup 30% terhadap cost, bukan gross margin 30% atas revenue.

Untuk gross margin 30%, cost share seharusnya maksimum 70% sebelum biaya lain.

### 8.4 Bank Fee Tidak Konsisten Unit

`Bank fee fixed deduction` bernilai `0.14` dan dikurangkan langsung dari harga rupiah sebelum VAT removal.

Jika maksudnya 14%, formula salah. Jika maksudnya Rp0,14, nilainya tidak material.

### 8.5 Pricing Tidak Mengakomodasi Perilaku Produk

Workbook mengasumsikan:

- Meeting 45 menit.
- Help action rate tertentu.
- Jumlah respons tertentu.

Produk tidak menegakkan:

- Durasi 45 menit.
- Jumlah klik.
- Jumlah reconnect.
- Jumlah concurrent session.
- Jumlah client secret.
- Fair-use.

### 8.6 Harga Model

Asumsi harga yang diverifikasi dari dokumentasi resmi OpenAI:

- `gpt-realtime-mini` text:
  - Input: $0.60/1M.
  - Cached input: $0.06/1M.
  - Output: $2.40/1M.
- `gpt-realtime-mini` audio:
  - Input: $10/1M.
  - Cached input: $0.30/1M.
  - Output: $20/1M.
- `gpt-5-mini`:
  - Input: $0.25/1M.
  - Cached input: $0.025/1M.
  - Output: $2/1M.
- `gpt-4o-mini-transcribe`: sekitar $0.003 per minute.

Harga Realtime dan GPT-5 Mini pada workbook masih sesuai. Asumsi transcription workbook lebih konservatif daripada harga resmi saat audit.

Sumber:

- https://developers.openai.com/api/docs/pricing/

## 9. OpenAI Data Retention dan Privacy

### 9.1 Responses API Tidak Menggunakan `store: false`

Profile PDF dan meeting context diproses melalui `/v1/responses`, tetapi body request tidak menetapkan:

```json
{
  "store": false
}
```

Dokumentasi resmi OpenAI menyatakan:

- Data API tidak digunakan untuk training secara default.
- Abuse monitoring log dapat disimpan hingga 30 hari.
- Responses API secara default memiliki application-state retention setidaknya 30 hari.
- `store: false` menghilangkan application-state retention untuk request yang kompatibel, tetapi tidak otomatis menghilangkan abuse-monitoring retention.

Sumber:

- https://developers.openai.com/api/docs/guides/your-data/

### 9.2 Privacy Policy Tidak Cukup Presisi

Privacy Policy menyebut penyedia AI, tetapi tidak menjelaskan:

- Nama atau kategori processor secara rinci.
- Bahwa CV PDF dikirim ke provider AI.
- Bahwa audio/transcript diproses provider Realtime.
- Periode retensi provider.
- Negara/region pemrosesan.
- Cara meminta penghapusan data provider.

### 9.3 Retensi Internal Tidak Terdefinisi

Privacy Policy menggunakan frasa “selama diperlukan” tanpa angka retention.

Tidak ada cleanup job untuk:

- Profile file lama.
- Transcript.
- Payment raw payload.
- User yang tidak aktif.
- Pending payment.
- Log.

### 9.4 Account Deletion dan Export Belum Ada

Privacy Policy menyebut hak pengguna untuk mengakses, memperbaiki, atau menghapus data.

Implementasi hanya menyediakan:

- Delete profile document tertentu.
- Delete meeting context.
- Delete ended live session.

Tidak tersedia:

- Delete account.
- Export seluruh data.
- Delete seluruh transcript/payment metadata.
- Status proses permintaan privasi.

### 9.5 File Deletion Tidak Terintegrasi dengan User Deletion

Database foreign key dapat menghapus profile document row saat user dihapus, tetapi file fisik tidak otomatis terhapus karena cleanup hanya berada pada service delete profile document.

## 10. Profile Document dan Meeting Context

### 10.1 Upload PDF Hanya Memeriksa MIME Client

Upload menerima `application/pdf`, tetapi tidak memeriksa:

- Magic bytes `%PDF`.
- Struktur PDF.
- Password-protected PDF.
- Polyglot file.
- Malware.

Batas ukuran 8 MB dan satu file per request sudah diterapkan.

### 10.2 Background Processing Tidak Durable

Profile processing dijalankan menggunakan fire-and-forget Promise dalam process API.

Jika process restart/crash:

- Job hilang.
- Row dapat tetap `processing`.
- Tidak ada worker queue.
- Tidak ada retry scheduler.

### 10.3 Concurrent Retry

Retry processing tidak memiliki:

- Distributed lock.
- Processing version.
- Idempotency key.
- Deduplication.

User dapat memicu beberapa request OpenAI untuk file yang sama.

### 10.4 Meeting Context Processing Sinkron

Create/update meeting context menunggu AI request langsung.

Dampak:

- Request dapat lama.
- Timeout client dapat terjadi sementara backend masih bekerja.
- Retry user dapat membuat duplikasi biaya.
- Tidak ada idempotency.

### 10.5 Tidak Ada Subscription Gate

Profile upload, retry, dan meeting-context preprocessing hanya memerlukan session.

Free user dapat menghasilkan biaya AI tanpa membeli paket.

### 10.6 Input Length Tidak Dibatasi

Schema meeting context hanya menetapkan `.min(1)` tanpa batas maksimum untuk:

- Context name.
- Meeting topic.
- Meeting brief.

Prompt builder memang memotong total context pada 24.000 karakter, tetapi database dan request tetap dapat menerima payload besar.

## 11. Realtime dan Token Usage

### 11.1 Stateless Response Sudah Benar

Hal yang sudah sesuai:

- Response menggunakan `conversation: "none"`.
- Setiap request membawa latest focus sendiri.
- Riwayat assistant dan transcript lama tidak menjadi response conversation.
- Latest question dipotong menjadi 360 karakter.
- Trigger text dipotong menjadi 160 karakter.
- Response instruction memperlakukan context sebagai untrusted data.

### 11.2 Static Context Masih Besar

Pengukuran menggunakan data lokal:

- Full context JSON: sekitar 11.052 karakter.
- Compact context JSON: sekitar 6.684 karakter.

Per-action instruction:

- `surface_keywords`: sekitar 755 token.
- `keyword`: sekitar 1.142 token.
- `followup`: sekitar 1.146 token.
- `explain`: sekitar 1.153 token.
- `answer_qna`: sekitar 1.840 token.
- `answer_convo`: sekitar 3.116 token.
- Legacy `answer`: sekitar 3.846 token.

Angka tersebut hanya estimasi karakter/4 dan bukan billing tokenizer resmi.

### 11.3 Keyword Response Dibuat Otomatis

Setelah setiap accepted transcript focus:

1. Keyword refresh dijadwalkan.
2. Model dipanggil.
3. User belum tentu membuka overlay atau mengklik keyword.

Setiap `response.create` tetap menambah biaya dan TPM.

### 11.4 Retry Dapat Menggandakan Biaya

Konfigurasi:

- Retry non-completed hingga 4 kali.
- Retry rate limit hingga 2 kali.
- Completed-but-empty retry 1 kali.

Walaupun queue mencegah paralel response pada satu socket, satu klik dapat menghasilkan beberapa model request.

### 11.5 Tidak Ada Persisted Usage Telemetry

Usage hanya dicetak ke console development.

Tidak ada penyimpanan:

- Input token.
- Cached token.
- Audio token.
- Output token.
- Cost per response.
- Retry count.
- Rate limit count.
- User/session attribution.

### 11.6 Client Secret Dapat Diminta Berulang

Endpoint client-secret:

- Memastikan user memiliki subscription.
- Memastikan session dimiliki user dan belum ended.

Namun tidak:

- Membatasi jumlah secret.
- Menandai secret aktif.
- Mengikat satu connection.
- Membatasi concurrent connection.

Secret berlaku 600 detik.

### 11.7 Tidak Ada Safety Identifier

User identity tidak diteruskan sebagai OpenAI safety identifier ketika membuat Realtime client secret.

### 11.8 Browser Menggunakan WebSocket

Browser membuka WebSocket langsung ke OpenAI menggunakan ephemeral secret.

Ephemeral credential adalah pendekatan yang benar. Namun dokumentasi OpenAI merekomendasikan WebRTC untuk browser karena lebih robust terhadap media/network behavior.

### 11.9 Transcript yang Disimpan Bukan Transcript Penuh

Conversation state hanya mempertahankan:

- 20 ordered turns.
- 8 history entries untuk UI.

`getFullTranscriptText()` memakai `conversationTurns`, sehingga end session hanya menyimpan maksimal 20 turn terakhir.

Sebaliknya, `transcriptItems` dan `transcriptOrder` tidak dibatasi sehingga memory dapat terus tumbuh pada meeting panjang.

### 11.10 Language Dikunci ke Bahasa Indonesia

Realtime transcription memakai:

```text
language: "id"
```

Meeting berbahasa Inggris atau campuran dapat mengalami penurunan akurasi.

### 11.11 Reconnect Tidak Mempertahankan Pending Help

Ketika socket close:

- Active help dibatalkan.
- Queued help dihapus.
- Keyword state dihapus.
- User diberi pesan kegagalan.

Reconnect mencoba kembali tanpa batas dengan delay maksimal 10 detik.

### 11.12 Masih Ada Flow Manual Retry

Jika transkrip belum selesai setelah 5 detik:

- Request tidak dikirim.
- Overlay menampilkan konteks belum siap.
- User harus menekan tombol lagi.

Ini masih berisiko pada situasi interview atau meeting bertekanan tinggi.

## 12. Audio Capture

### 12.1 Compatibility Terbatas

Implementasi bergantung pada:

- `getDisplayMedia`.
- Chrome modern.
- Windows system audio behavior.
- User memilih Entire Screen.
- User mengaktifkan Share system audio.

Landing page belum menampilkan keterbatasan ini dengan jelas.

### 12.2 Video Track Tetap Ditangkap

Browser meminta video entire-screen dengan maksimum 1 FPS untuk memperoleh system audio.

Walaupun video tidak dikirim ke backend/OpenAI, capture tetap:

- Memunculkan permission yang sensitif.
- Menggunakan resource.
- Berpotensi membuat pengguna khawatir.

### 12.3 Semua System Audio Dapat Diproses

Audio gate hanya menggunakan level threshold.

Audio yang dapat terkirim meliputi:

- Suara meeting.
- Notifikasi.
- Video lain.
- Musik.
- Suara aplikasi lain.

Tidak ada source separation.

### 12.4 Silence Suppression Sudah Ada

Hal positif:

- Prebuffer.
- Signal threshold.
- Tail chunks.
- Silent chunk suppression.
- Metrics development.

Namun threshold bersifat hardcoded dan belum diuji lintas device/audio volume.

## 13. Database dan Migration

### 13.1 Migration Drift

Repository memiliki migration `0000` sampai `0004`.

Database lokal hanya mencatat empat migration, sehingga `0004_cleanup_legacy_payments` belum diterapkan.

Actual payment table masih memiliki legacy Midtrans structure/index yang seharusnya dibersihkan migration 0004.

### 13.2 `user_profiles.user_id` Tidak Unique

Schema tidak menjamin satu user hanya memiliki satu user profile.

Database lokal saat audit tidak memiliki duplicate user profile, tetapi invariant tidak ditegakkan database.

### 13.3 Usage Event Tidak Memiliki Session Foreign Key

`live_meeting_usage_events.live_meeting_session_id` hanya UUID dan unique, tanpa foreign key.

Ini mempertahankan quota saat session dihapus, tetapi menghasilkan orphan ledger yang sulit diaudit.

Database lokal memiliki usage event yang session-nya sudah dihapus.

### 13.4 Pending Payment Stale

Lima pending payment lokal berumur lebih dari 24 jam.

### 13.5 Hasil Integrity Check Lokal

Tidak ditemukan:

- Cross-user profile ownership.
- Cross-user meeting-context ownership.
- Malformed paid subscription.
- Stale active meeting lebih dari 6 jam.
- Duplicate user profile saat audit.
- Sisa simulation user setelah cleanup.

## 14. API dan Error Handling

### 14.1 Pesan Error Internal Diteruskan ke Client

Banyak route mengirim langsung `error.message`.

Ini dapat membocorkan:

- Detail OpenAI.
- Organization ID.
- Model name.
- Rate-limit quota.
- Internal database/service error.

### 14.2 List Endpoint Tanpa Pagination

Endpoint berikut mengembalikan seluruh data user:

- Profile document list.
- Meeting context list.
- Live session list.

Live session juga dapat membawa transcript penuh yang tersimpan.

### 14.3 End Transcript Tidak Memiliki Batas Maksimum

`transcriptText` hanya `z.string().optional()`.

Fastify default body limit memberi batas kasar, tetapi tidak ada product-level limit atau truncation policy.

### 14.4 Health Check Dangkal

`/health` selalu mengembalikan:

```json
{
  "ok": true
}
```

Health check tidak memeriksa:

- Database.
- Migration state.
- Storage writeability.
- OpenAI configuration.
- Payment configuration.

## 15. CORS dan Security Headers

### 15.1 CORS Arbitrary Origin

API menggunakan:

```text
origin: true
credentials: true
```

Pengujian lokal dan dev publik menunjukkan Origin arbitrary direfleksikan.

SameSite Lax mengurangi sebagian risiko cookie cross-site, tetapi konfigurasi tetap berbahaya untuk future endpoint dan development bypass.

### 15.2 Security Headers Tidak Lengkap

Endpoint publik yang diuji tidak menunjukkan:

- Content-Security-Policy.
- Strict-Transport-Security.
- X-Frame-Options atau `frame-ancestors`.
- X-Content-Type-Options.
- Referrer-Policy.
- Permissions-Policy.

Nginx juga mengekspos versi `nginx/1.18.0 (Ubuntu)`.

### 15.3 TLS

Hasil TLS:

- `orviko.net`: TLS 1.3, sertifikat Let's Encrypt valid.
- `dev.orviko.net`: TLS 1.3, sertifikat Let's Encrypt valid.
- Keduanya berakhir sekitar 30 Agustus 2026, tersisa sekitar 66 hari saat audit.

HTTP-to-HTTPS redirect tidak berhasil diverifikasi karena probe network timeout.

## 16. Deployment dan Infrastructure

### 16.1 Dokumentasi Deployment Belum Memuat Web App

`docs/VPS.md` hanya menunjukkan static root:

- Prod: `apps/web/dist`.
- Dev: `apps/web/dist`.

Tidak ada deployment target untuk `apps/web-app/dist`.

### 16.2 Database Credential Lemah pada Dokumentasi

Dokumentasi menggunakan:

```text
postgres://postgres:postgres@127.0.0.1:5432/...
```

Tidak ada:

- Least-privilege DB user.
- Credential rotation.
- Secret manager.
- TLS database guidance.

### 16.3 Backup Tidak Diimplementasikan

Folder `backups/` disebut, tetapi tidak ada:

- `pg_dump` schedule.
- Backup encryption.
- Retention.
- Offsite copy.
- Restore procedure.
- Restore drill.

### 16.4 Tidak Ada CI/CD

Tidak ditemukan:

- `.github/workflows`.
- Automated build gate.
- Automated test gate.
- Dependency audit gate.
- Migration verification.
- Deployment rollback automation.

### 16.5 Tidak Ada Monitoring dan Alerting

Tidak tersedia:

- Error monitoring.
- Uptime alert.
- Rate-limit alert.
- Cost alert.
- Webhook failure alert.
- Stuck processing alert.
- Disk/database capacity alert.

### 16.6 Deployment Flow Berisiko

Dokumentasi memakai:

```text
git pull
npm run build
npm run db:migrate
systemctl restart
```

Tidak ada:

- Immutable artifact.
- Pre-deployment smoke test.
- Migration backup.
- Zero-downtime strategy.
- Automated rollback.

Dokumentasi juga menyarankan menyalin `node_modules` production ke development bila lockfile sama. Praktik ini meningkatkan coupling dan risiko environment contamination.

## 17. Environment dan Configuration

### 17.1 Local Web App Default ke Shared Dev API

Jika env tidak diset, Web App development menggunakan:

```text
https://dev.orviko.net
```

Local development dapat tanpa sadar membaca/menulis shared dev data.

### 17.2 Auth Gate Dimatikan pada Development

`WebOnboarding` langsung menggunakan gate `home` pada Vite development.

Akibatnya normal local development tidak menguji:

- Login.
- Subscription gate.
- Expiry.
- Checkout return flow.

### 17.3 Local Lynk Configuration Belum Lengkap

Root `.env` lokal saat audit:

- Tidak memiliki `LYNK_WEBHOOK_SECRET`.
- Tidak memiliki URL Mini/Starter/Pro.
- Semua plan fallback ke default profile URL.

### 17.4 Model Text Tidak Dikunci

Production hanya memastikan `OPENAI_API_KEY` tersedia.

`OPENAI_TEXT_MODEL` dapat diubah ke model jauh lebih mahal tanpa startup rejection.

### 17.5 Price Override Production

Environment dapat mengubah `ORVIKO_MINI_PRICE`, `ORVIKO_STARTER_PRICE`, dan `ORVIKO_PRO_PRICE`.

Production hanya menolak nilai `0`, bukan harga salah lainnya.

Landing/pricing frontend tidak otomatis mengikuti override tersebut.

## 18. Landing Page, Pricing, Checkout, dan Legal

### 18.1 Copy Pricing Sudah Kedaluwarsa

Pricing masih menampilkan:

- “Gunakan di web (coming soon)”.
- “Review CV (coming soon)”.

Produk sudah dipivot penuh ke Web App, sementara Review CV belum tersedia sebagai fitur produk.

### 18.2 Klaim `~800ms` Belum Terbukti

Landing mengklaim target response time sekitar 800 ms.

Runtime memiliki:

- Settle window.
- Transcript wait hingga 5 detik.
- Queue.
- Retry.
- Rate-limit cooldown.
- Reconnect.

Klaim tersebut belum didukung production telemetry atau SLA.

### 18.3 Klaim Kompatibilitas Terlalu Luas

Landing menyebut dapat digunakan pada platform apa pun dan menampilkan Zoom, Meet, dan Teams.

Kondisi nyata:

- Chrome terbaru.
- Windows.
- Entire Screen sharing.
- Share system audio.
- Dukungan browser/OS tertentu.

### 18.4 Fair-Use Tidak Terdefinisi

Pricing menyebut Pro unlimited dengan penggunaan wajar, tetapi tidak menjelaskan:

- Batas sesi.
- Durasi.
- Concurrent use.
- Token/click limit.
- Kapan throttling/suspension diterapkan.

Backend juga tidak memiliki enforcement.

### 18.5 Checkout Handoff Rapuh

User harus:

1. Login.
2. Copy email.
3. Membuka Lynk.
4. Mengisi email yang sama.

Aktivasi bergantung pada email dan nominal, bukan checkout/order ID terintegrasi.

### 18.6 Payment Status Page Tidak Terhubung

Halaman success/pending/failed memerlukan internal `payment_id`, tetapi Lynk redirect tidak terlihat membawa ID tersebut.

### 18.7 Legal Page Belum Final

Privacy Policy dan Terms masih mengandung:

```text
Alamat entitas hukum: akan dilengkapi pada versi final
```

Forum sengketa juga belum dinyatakan jelas.

### 18.8 Fitur Legal Tidak Tersedia

Terms menyebut cancellation dan kemungkinan auto-renewal, tetapi aplikasi belum memiliki:

- Account page.
- Cancellation control.
- Renewal status.
- Invoice history.
- Refund workflow.

## 19. Frontend Security

### 19.1 React Web App Tidak Memiliki Unsafe HTML Sink

Web App React menggunakan normal React escaping dan tidak memakai `dangerouslySetInnerHTML`.

### 19.2 Checkout Memakai `innerHTML`

Payment status page membuat markup dari value API menggunakan `innerHTML`.

Server saat ini membatasi sebagian besar value, sehingga exploitability belum langsung tinggi. Namun ini latent DOM-XSS sink jika provider/API value berubah.

Rekomendasi:

- Gunakan DOM node dan `textContent`.
- Jangan interpolasi error message atau provider-controlled field ke HTML.

## 20. Accessibility

Temuan:

- Pricing page tidak memiliki `<h1>`.
- Pricing page tidak memiliki `<main>`.
- Tidak ada skip link.
- Checkout modal belum memiliki focus trap.
- Escape tidak menutup modal.
- Focus tidak dikembalikan ke trigger.
- Overlay response memakai `aria-live`, tetapi perubahan cepat dapat terlalu verbose.
- Input overlay memiliki `outline: none` yang menimpa focus-visible rule karena specificity sama dan urutan lebih akhir.
- Landing demo input tidak memiliki label eksplisit.
- Tidak ada `prefers-reduced-motion`.
- Beberapa loading animation tidak memiliki accessible status yang lengkap.

Hal positif:

- Mayoritas button memiliki `type`.
- Banyak section memakai `aria-labelledby`.
- Audio level memakai role `meter`.
- Gambar dekoratif banyak yang sudah memiliki alt kosong.
- Browser smoke test mobile tidak menemukan horizontal overflow.

## 21. Performance

Landing page memuat aset besar:

- `interview.mp4`: sekitar 4,1 MB dan autoplay.
- Hero background: sekitar 2,3 MB.
- Microsoft Teams PNG: sekitar 2,1 MB.
- Google Meet PNG: sekitar 1,38 MB.
- Wallpaper: sekitar 1,3 MB.
- Logo PNG: ratusan KB.

Masalah:

- Hero background dimuat langsung.
- Video autoplay tanpa poster/preload policy.
- PNG logo/platform belum dioptimasi.
- Tidak ada responsive image.
- Tidak ada lazy loading video.

## 22. SEO dan Discoverability

Tidak ditemukan:

- Meta description.
- Canonical URL.
- Open Graph.
- Twitter card.
- Structured data.
- Favicon.
- Web manifest.
- Sitemap.
- Robots configuration.

## 23. Intellectual Property dan Asset Provenance

Repository menggunakan:

- Video interview.
- Foto.
- Sample audio.
- Logo Zoom.
- Logo Google Meet.
- Logo Microsoft Teams.

Tidak ditemukan dokumentasi:

- Sumber aset.
- License.
- Bukti pembelian.
- Attribution.
- Permission untuk suara/wajah.
- Trademark usage guideline.

Area ini perlu review legal sebelum production marketing.

## 24. Dependency License

Package dependency yang terdeteksi mayoritas:

- MIT.
- ISC.
- BSD.
- Apache-2.0.
- BlueOak.
- Unlicense.
- CC-BY-4.0.

Tidak ditemukan dependency AGPL/GPL/SSPL pada metadata paket yang diaudit.

Workspace package internal tidak mendeklarasikan license karena bersifat private.

Tetap diperlukan:

- Generate third-party notices.
- Verifikasi asset license secara terpisah.
- Review CC-BY attribution bila package tersebut ikut didistribusikan.

## 25. Test Suite dan Quality Gate

### 25.1 Test yang Berhasil

- Shared TypeScript build.
- API typecheck.
- Web App typecheck.
- Marketing Web production build.
- Web App production build.
- Auth/payment contract test.
- Data-integrity contract test.
- API Realtime MVP contract test.
- Meeting response router test.
- Web Realtime test.
- Web workspace model test.
- Database integrity simulation 25 iterasi.
- Browser smoke test landing.
- Browser smoke test pricing.
- Browser smoke test checkout unauthenticated.
- Mobile viewport smoke test.
- Payment tamper test.
- Payment IDOR test.
- Production environment guard test.

### 25.2 Database Test Dapat Memakai OpenAI Key Asli

Test melakukan:

```text
process.env.OPENAI_API_KEY = ""
```

Tetapi `env.ts` memuat `.env` menggunakan `override:true`, sehingga real key menimpa nilai kosong.

Run awal:

- Menjadi lambat.
- Berpotensi memakai biaya OpenAI nyata.
- Timeout.
- Meninggalkan simulation users.

Test kemudian dijalankan dari environment terisolasi dan berhasil. Seluruh simulation user telah dibersihkan.

### 25.3 Database Test Tetap Meninggalkan Tiga User

Bahkan run sukses menghasilkan tiga `sim-*` users dari route simulation karena cleanup utama berjalan sebelum simulation tersebut.

Data telah dibersihkan manual setelah audit.

### 25.4 Realtime Test Terlalu Static

`test-realtime-context.ts` sebagian besar memeriksa:

- Regex.
- Source strings.
- Helper function.

Belum menguji lifecycle nyata:

- WebSocket event ordering.
- Response ownership race.
- Audio/VAD.
- Low-volume speech.
- Reconnect.
- Multiple cancellation.
- Rate-limit burst.
- Real OpenAI Realtime.

### 25.5 Tidak Ada Coverage dan Lint

Tidak ditemukan:

- ESLint.
- Formatting gate.
- Coverage report.
- Minimum coverage.
- Pre-commit hook.
- CI test enforcement.

## 26. Deployment Probe

Hasil yang berhasil diverifikasi:

- `orviko.net/health` pernah merespons `200`.
- `dev.orviko.net` root/pricing/app/health pernah merespons `200`.
- `/app/` dev memiliki karakteristik content yang sama dengan landing, konsisten dengan fallback yang salah.
- Dev health merefleksikan arbitrary Origin.
- TLS prod/dev valid dan memakai TLS 1.3.

Keterbatasan:

- Network beberapa kali timeout.
- Prod root/pricing/app tidak konsisten dapat diambil.
- Tidak tersedia SSH/VPS access.
- Nginx active config tidak dapat diperiksa langsung.
- Environment production tidak dapat dibaca.
- Lynk dan Google dashboard tidak dapat diperiksa.

Karena itu, source/config findings bersifat confirmed, sedangkan sebagian deployment state ditandai belum terverifikasi.

## 27. Hal yang Sudah Dilakukan dengan Benar

- Server menentukan harga payment.
- Server menentukan target user berdasarkan session.
- Plan hanya menerima allowlist `mini`, `starter`, atau `pro`.
- Payment IDOR ditolak.
- Repository query utama menggunakan user ownership.
- Payment settlement memakai database transaction dan row lock.
- External transaction ID memiliki uniqueness protection.
- Limited-plan usage dihitung dalam transaction dengan user row lock.
- Cookie production memakai HttpOnly, Secure, dan SameSite Lax.
- Live start dan client-secret memerlukan active subscription.
- Realtime response bersifat stateless.
- Latest conversation focus digunakan sebagai runtime input.
- Static context dikompresi.
- User/profile/meeting data diperlakukan sebagai untrusted prompt data.
- Response output dibatasi dan dinormalisasi.
- Silence suppression audio telah tersedia.
- No secret/private key ditemukan pada tracked source text yang dipindai.
- Production environment menolak missing critical secret, development database URL, localhost frontend URL, default session secret, dan zero-price override.

## 28. Area yang Belum Dapat Diverifikasi

Audit tidak dapat menyatakan area berikut aman tanpa akses tambahan:

- Active Nginx configuration.
- Active systemd unit.
- VPS filesystem permission.
- Production `.env`.
- Database production schema/migration state.
- Production database credential.
- Actual backup files dan restore test.
- Lynk dashboard, webhook format resmi, dan delivery log.
- Google OAuth console configuration final.
- OpenAI project limits, budget alert, data-control status, dan usage dashboard.
- Domain DNS failover.
- CDN/WAF configuration.
- Incident response process.
- Legal ownership seluruh asset.
- Full payment end-to-end pada produk Lynk nyata.
- Full OAuth login pada production.
- Long-running real meeting pada production.

## 29. Prioritas Perbaikan

### Phase 0 — Stop-Ship

1. Jangan deploy production.
2. Hapus CV/audio sensitif dari Git dan history.
3. Pastikan repository dan clone lama ditangani.
4. Tutup development auth bypass.
5. Batasi CORS.

### Phase 1 — Payment dan Access Integrity

1. Integrasikan webhook signature resmi.
2. Hapus query secret.
3. Korelasikan provider order/product ID.
4. Verifikasi currency dan exact amount.
5. Tambahkan event ledger dan idempotency.
6. Implementasikan refund/chargeback revocation.
7. Expire pending checkout.
8. Tambahkan reconciliation.
9. Definisikan renewal, upgrade, downgrade, dan quota period.

### Phase 2 — Cost Safety

1. Samakan pricing workbook, backend, landing, dan Lynk.
2. Koreksi formula margin.
3. Tetapkan session duration.
4. Tetapkan Pro fair-use.
5. Tambahkan per-user rate limit.
6. Batasi active session dan client secret.
7. Gate preprocessing dengan entitlement.
8. Persist usage/token/cost.
9. Tambahkan project-level OpenAI budget alerts.

### Phase 3 — Web App Deployment

1. Tetapkan `/app/` sebagai route resmi.
2. Set Vite base.
3. Deploy `apps/web-app/dist`.
4. Tambahkan Nginx SPA routing.
5. Uji OAuth callback sampai Web App.
6. Uji asset dan AudioWorklet dari `/app/`.

### Phase 4 — Privacy dan Data Lifecycle

1. Tambahkan `store:false`.
2. Definisikan retention period.
3. Implementasikan account delete/export.
4. Hapus file storage saat user dihapus.
5. Redact webhook/log data.
6. Tambahkan cleanup jobs.
7. Update Privacy Policy dan Terms.

### Phase 5 — Reliability dan Realtime

1. Hapus automatic keyword generation atau jadikan on-demand.
2. Kurangi retry amplification.
3. Persist usage telemetry.
4. Pertahankan queued help saat reconnect.
5. Hilangkan manual retry flow.
6. Batasi transcript memory.
7. Simpan transcript sesuai label produk.
8. Evaluasi WebRTC.
9. Uji bahasa Indonesia, Inggris, dan campuran.

### Phase 6 — Platform Hardening

1. Terapkan migration 0004.
2. Update dependency vulnerable.
3. Tambahkan security headers.
4. Tambahkan deep health/readiness check.
5. Gunakan least-privilege DB user.
6. Buat encrypted backup dan restore drill.
7. Tambahkan monitoring, logging, alerting, dan CI/CD.

### Phase 7 — Product Quality

1. Bersihkan copy `coming soon`.
2. Hapus atau buktikan klaim `~800ms`.
3. Jelaskan compatibility requirement.
4. Finalisasi legal identity.
5. Perbaiki accessibility.
6. Optimalkan aset landing.
7. Tambahkan SEO baseline.
8. Dokumentasikan asset license.

## 30. Release Gate yang Disarankan

Production release hanya boleh dilakukan bila:

- Tidak ada data pribadi di Git/history.
- `/app/` benar-benar menyajikan Web App.
- OAuth login end-to-end berhasil.
- Tiga plan mengarah ke produk Lynk yang tepat.
- Payment amount dan plan cocok server-side.
- Webhook signature tervalidasi.
- Duplicate webhook idempotent.
- Refund/chargeback mencabut akses.
- Active subscription membuka Web App.
- Expired/unpaid user ditolak.
- Cross-user access test lulus.
- Per-user rate limit dan cost cap aktif.
- Pricing model sesuai entitlement.
- Migration production up-to-date.
- Critical/high dependency vulnerability ditutup atau diterima secara formal.
- Security headers aktif.
- Account deletion dan data cleanup bekerja.
- Backup restore berhasil diuji.
- Real meeting endurance test lulus tanpa manual retry.
- Cost per session tercatat dan masih di bawah budget.
- Monitoring serta alerting aktif.

## 31. Final Assessment

Fondasi domain ownership dan server-authoritative pricing sudah cukup baik. Implementasi Realtime juga telah bergerak ke desain stateless yang tepat.

Namun produk belum memiliki boundary produksi yang diperlukan pada:

- Perlindungan data.
- Payment authenticity.
- Cost containment.
- Deployment Web App.
- Subscription lifecycle.
- Operational reliability.

Risiko terbesar bukan hanya bug teknis, tetapi kombinasi antara kebocoran data, aktivasi payment yang ambigu, unlimited AI cost, dan deployment route yang belum benar.

Keputusan akhir audit:

> Status production readiness: **NO-GO** sampai seluruh temuan Critical dan release gate utama diselesaikan.

