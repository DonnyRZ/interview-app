# Orviko Audit Report - 11 Juli 2026

Baseline: branch `dev`, commit remote `a772e1f4b38910f799fd834d3d11fb5799d8a74d`.

## Gap Awal yang Terkonfirmasi

- Checkout membuat order reference unik, tetapi URL Lynk statis tidak membawa reference tersebut. Aktivasi aman tidak dapat bekerja sampai Lynk mengembalikannya pada webhook.
- Refund/chargeback payment lama dapat mencabut subscription terbaru karena revocation hanya difilter berdasarkan user.
- Webhook untuk intent berbeda milik user yang sama belum diserialkan, sehingga renewal/refund paralel dapat race.
- Production env belum membuktikan domain canonical, kesamaan origin OAuth/CORS, atau konfirmasi kontrak reference checkout.
- Payment status page memakai `innerHTML` dengan data API dan meminta field `orderId` yang tidak diekspos API.
- Pricing masih menyebut Web App dan Review CV `coming soon`, Pro `unlimited`, dan landing mengklaim `~800ms`; semuanya tidak sesuai runtime/enforcement saat ini.
- Probe live membuktikan `https://orviko.net/app/` dan `https://dev.orviko.net/app/` masih menyajikan landing page, bukan build React Web App.
- Identitas/alamat entitas pada Privacy Policy dan Terms masih placeholder dan tidak boleh diisi tanpa data legal pemilik.

## Pekerjaan yang Dilakukan

- Menambahkan order reference unik ke URL checkout melalui `LYNK_CHECKOUT_ORDER_REFERENCE_PARAM` dan fail-closed production gate melalui `LYNK_CHECKOUT_ORDER_REFERENCE_CONFIRMED`.
- Memperketat production env: canonical HTTPS `orviko.net`, CORS harus memuat frontend origin, callback Google harus satu origin/path, DB tidak boleh memakai superuser default, serta autentikasi dan reference Lynk wajib dikonfirmasi.
- Men-serialize perubahan entitlement per user dengan database row lock.
- Membatasi refund/chargeback ke payment intent sumber; refund lama tidak mencabut renewal baru, dan refund renewal memulihkan periode sebelumnya bila masih valid.
- Menolak transisi payment terlambat/tidak valid dan menambah skenario DB integration untuk refund/renewal.
- Menghapus DOM-XSS sink pada payment status page dengan DOM node + `textContent`.
- Menyelaraskan pricing dengan kuota backend (Mini 3, Starter 12, Pro fair-use 60), menghapus fitur yang belum ada, menghapus klaim latency tanpa bukti, serta menambah SEO dasar.
- Memperbarui dokumentasi deployment/payment dan membuat CI menjalankan seluruh contract, DB, realtime, workspace, build, app-base, serta high/critical dependency audit.
- Menambahkan konfigurasi Nginx prod/dev yang versioned dengan redirect HTTPS, certificate path terpisah, route Web App `/app/`, API proxy, cache policy, CSP, HSTS, dan security headers.

## Hasil Testing

Lulus:

- `npm run typecheck`
- `npm run build`
- API: auth/payment, data-integrity contract, cost-safety, realtime MVP, meeting-response-router
- Web App: realtime, workspace, `/app/` build-base contract
- PostgreSQL 16: seluruh 12 migration dari database bersih, privacy lifecycle, phase-7 readiness/operations, dan data-integrity DB 25 iterasi
- Payment DB: paid activation, idempotency, tamper rejection, quota, renewal, refund latest dengan fallback, dan refund lama tidak mencabut subscription terbaru
- Deployment: contract test, `nginx -t` prod/dev dengan TLS certificate dummy, serta smoke test `/app/` (HTML `200`, hashed asset `200`, missing asset `404`, SPA deep-link `200`)
- Production env guard: konfigurasi aman diterima dan domain non-Orviko ditolak
- Git refs scan: tidak menemukan path CV/profile document atau sample audio sensitif lama
- Public probe: `/health` dan `/ready` merespons `200` pada prod dan dev
- `npm audit`: 0 critical, 0 high; 4 moderate pada dev-only chain `drizzle-kit`/legacy `esbuild`, belum ada upgrade upstream non-breaking

Quality gate final dijalankan ulang berurutan terhadap worktree terbaru dan seluruh command
di atas exit `0`. PostgreSQL test container dihentikan setelah verification selesai.

Masih memerlukan verifikasi eksternal:

- Checkout Lynk nyata, delivery webhook yang membawa order reference, Google OAuth production, dan refund nyata memerlukan dashboard/provider credentials.
- Route live `/app/` masih salah pada kedua domain. Konfigurasi versioned sudah siap dan tervalidasi, tetapi penerapan/reload memerlukan akses VPS.
- Nama badan usaha/pengendali data dan alamat legal final memerlukan data resmi dari pemilik produk.

## Status Rilis

`NO-GO` sampai route `/app/` prod/dev benar-benar menyajikan Web App, transaksi Lynk dev membuktikan order reference dan autentikasi webhook, Google OAuth production lulus, serta identitas legal final diisi. Source code kini fail-closed untuk kontrak payment production tersebut.
