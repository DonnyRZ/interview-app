# Web App Runtime Rules

Web App adalah satu-satunya runtime produk Orviko. Aturan di file ini menjadi source of truth untuk behavior live meeting.

## Realtime Context

- Web wajib memakai `packages/shared/src/realtime-conversation-state.ts`.
- Empat quick actions memakai stable conversation terakhir yang diterima; jangan menambahkan TTL keras.
- Batas umur dua menit hanya boleh dipakai untuk discovery keyword, bukan untuk mematikan tombol bantuan.
- Raw/interim transcript tidak boleh ditampilkan sebagai `Latest conversation focus` sebelum lolos quality gate dan focus derivation.
- Transcript item harus menjaga item id, previous item id, urutan, deduplication, serta pemilihan delta/final paling lengkap.
- Context derivation wajib menerima profil dan meeting context runtime, bukan object context kosong.
- Latest conversation focus hanya boleh berasal dari turn accepted terbaru. Jangan menggabungkan pertanyaan lama ke focus baru.
- Riwayat transcript boleh disimpan untuk rekaman sesi, tetapi tidak boleh dikirim sebagai memori ke response bantuan.

## Stateless Help

- Semua quick action, keyword help, dan free Ask memakai `response.create` out-of-band dengan `conversation: "none"`.
- Jangan membuat `conversation.item.create` untuk prompt bantuan atau keyword.
- Input response hanya action, latest accepted focus, dan explicit user text request saat ini.
- Sesi audio memakai instruksi transkripsi minimal. Setiap response membawa instruksi khusus action agar tidak membayar seluruh aturan tombol lain.
- Profil user, konteks meeting, dan domain profile tetap wajib tersedia dalam instruksi response action saat ini.
- Output bantuan dan keyword tidak boleh ditambahkan ke default Realtime Conversation.
- Jika final transcript masih diproses ketika user klik, satu klik harus menunggu otomatis dalam loading state.

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
npm.cmd run build
```
