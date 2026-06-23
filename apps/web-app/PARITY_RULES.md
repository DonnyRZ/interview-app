# Web App Parity Rules

Web App adalah pivot distribusi dari Desktop App. Desktop tetap menjadi acuan perilaku produk sampai sebuah perbedaan disetujui secara eksplisit.

## Realtime Context

- Desktop dan web wajib memakai `packages/shared/src/realtime-conversation-state.ts`.
- Empat quick actions memakai stable conversation terakhir yang diterima; jangan menambahkan TTL keras.
- Batas umur dua menit hanya boleh dipakai untuk discovery keyword, bukan untuk mematikan tombol bantuan.
- Raw/interim transcript tidak boleh ditampilkan sebagai `Latest conversation focus` sebelum lolos quality gate dan focus derivation.
- Transcript item harus menjaga item id, previous item id, urutan, deduplication, serta pemilihan delta/final paling lengkap.
- Context derivation wajib menerima profil dan meeting context runtime, bukan object context kosong.

## Audio

- Jangan menolak transcript final berdasarkan umur signal audio lokal.
- Jangan membuang PCM hanya karena level sesaat berada di bawah threshold. Level hanya untuk status UX.
- Pertahankan rolling prebuffer agar awal ucapan tidak hilang saat Realtime sedang tersambung.
- Status audio harus jujur; koneksi WebSocket bukan bukti audio meeting tertangkap.

## Workspace

- Production Web App harus melewati login dan subscription gate.
- User harus dapat memilih profil referensi per konteks meeting.
- Riwayat sesi, recovery sesi aktif yang stuck, pengakhiran, dan penghapusan sesi harus tersedia.
- Kegagalan mengakhiri sesi tidak boleh ditelan tanpa recovery path.

## Floating Overlay

- Overlay browser menggunakan Document Picture-in-Picture.
- Jika browser tidak mendukungnya, tampilkan incompatibility error sebelum membuat live session.
- Jangan menyebut panel dalam tab sebagai floating always-on-top overlay.

## Verification

Setelah mengubah runtime web:

```txt
npm.cmd run typecheck
npm.cmd --workspace @interview-app/web-app run test:realtime
npm.cmd --workspace @interview-app/web-app run test:workspace
npm.cmd --workspace @interview-app/desktop run test:overlay-runtime
npm.cmd run build
```
