# Orviko Meeting Assistant

Desktop application untuk membantu user saat online meeting dengan floating overlay AI yang muncul di atas meeting, video, atau browser.

Fokus utama aplikasi ini:

- menangkap konteks percakapan meeting secara near real-time
- memberi bantuan respons dalam bentuk teks, bukan auto-speaking
- membantu user menjawab pertanyaan, menanggapi percakapan, membuat follow-up, dan memahami maksud lawan bicara
- menjaga bantuan tetap relevan dengan profil user, konteks meeting, dan transcript terbaru

Orviko tidak dirancang untuk berbicara otomatis menggantikan user. User tetap memegang kontrol kapan bantuan AI dimunculkan.

## Gambaran Singkat

Alur kerja aplikasi secara umum:

1. User upload profil / dokumen referensi.
2. Sistem memproses profil menjadi identity reference yang bisa dipakai lintas meeting.
3. User membuat konteks meeting berisi nama konteks, topik, dan brief.
4. Konteks meeting memakai profil default saat dibuat.
5. Di halaman detail konteks, user bisa memilih profil referensi sesi dari dokumen yang sudah diupload.
6. User memulai sesi meeting live.
7. Floating overlay mulai listening melalui system audio.
8. Saat percakapan berlangsung, transcript, latest conversation focus, dan keyword runtime diperbarui.
9. User bisa meminta bantuan seperti:
   - `Jawab Pertanyaan`
   - `Tanggapi`
   - `Pertanyaan Follow-up`
   - `Jelaskan Maksudnya`
   - keyword chip
   - free `Ask`

## Arsitektur

Project ini memakai monorepo sederhana:

- `apps/api`
  Backend API berbasis Fastify. Menangani data profil, konteks meeting, sesi live, preprocessing AI, prompt backend, dan pembuatan realtime client secret.

- `apps/desktop`
  Desktop app berbasis Electron + React. Menyediakan dashboard, flow meeting, system audio check, dan floating overlay.

- `apps/web`
  Landing page web. Saat ini belum menjadi fokus pivot terbaru.

- `packages/shared`
  Shared schema dan type yang dipakai lintas backend dan desktop.

Beberapa nama internal masih memakai terminology legacy untuk mengurangi blast radius migrasi. User-facing product framing saat ini adalah online meeting assistant.

## Kemampuan Utama

- upload dan proses profil / dokumen referensi user
- membuat konteks meeting dari nama, topik, dan brief
- memilih profil referensi per konteks meeting
- memulai sesi meeting live dengan floating overlay
- menangkap system audio pada Windows melalui WASAPI loopback helper
- menjalankan live runtime dengan `gpt-realtime-mini`
- memisahkan respons eksplisit:
  - `Jawab Pertanyaan` untuk QnA-style answer
  - `Tanggapi` untuk respons natural Convo-style
- menyimpan transcript sesi live
- recovery sesi lama yang stuck dengan tombol `Akhiri`

## Model AI

Saat ini pembagian peran model secara umum:

- `gpt-5-mini`
  Dipakai untuk proses non-live seperti preprocessing profil, preprocessing konteks meeting, dan workflow text backend lainnya.

- `gpt-realtime-mini`
  Dipakai untuk sesi meeting live yang membutuhkan audio input, transcript runtime, dan bantuan overlay near real-time.

Prompt produksi dijaga agar general meeting-oriented dan tidak mengarah ke use case atau domain tertentu kecuali runtime data memang menyebutnya.

## UX Meeting

Saat user klik `Mulai Meeting`:

- backend membuat sesi live
- Electron membuka floating overlay
- app menyiapkan realtime session
- system audio dipakai untuk menangkap suara meeting

Selama meeting:

- overlay mode mini dipakai untuk keadaan pasif
- overlay bisa expand untuk menampilkan focus, action buttons, keyword chips, dan ask box
- bantuan AI hanya muncul ketika user menekan tombol bantuan atau mengirim ask manual

Saat meeting selesai:

- overlay mencoba mengakhiri sesi melalui Electron main secara langsung ke API
- renderer dashboard tetap menerima event untuk refresh UI
- kalau ada sesi lama yang masih tercatat `Dimulai`, user bisa klik `Akhiri` lalu `Hapus`

## Tech Stack

- Electron
- React
- Vite
- Fastify
- Zod
- Drizzle ORM
- PostgreSQL
- OpenAI API
- WASAPI loopback helper untuk Windows system audio capture

## Menjalankan Project

### Prasyarat

- Node.js
- npm
- Docker Desktop
- PostgreSQL melalui `docker-compose`
- OpenAI API key
- Windows untuk flow system audio loopback saat meeting live

### Setup

1. Copy `.env.example` menjadi `.env`.
2. Isi `OPENAI_API_KEY`.
3. Jalankan database:

```bash
docker compose up -d
```

4. Jalankan migration:

```bash
npm run db:migrate
```

5. Jalankan backend:

```bash
npm run dev:api
```

6. Jalankan desktop app:

```bash
npm run dev:desktop
```

## Script Penting

```bash
npm run dev:api
npm run dev:desktop
npm run dev:web
npm run build
npm run typecheck
npm run db:migrate
npm run db:seed:dev
```

Test dan simulasi penting:

```bash
npm.cmd --workspace @interview-app/api run test:data-integrity
npm.cmd --workspace @interview-app/api run test:data-integrity-db
npm.cmd --workspace @interview-app/api run test:meeting-response-router
npm.cmd --workspace @interview-app/desktop run test:overlay-runtime
npm.cmd --workspace @interview-app/desktop run test:keywords
npm.cmd --workspace @interview-app/desktop run test:transcript-focus
```

## Catatan

- Flow live meeting saat ini ditujukan untuk desktop Windows karena audio capture memakai WASAPI loopback helper.
- Dashboard dan overlay sudah dipivot ke framing meeting assistant; landing page `apps/web` masih perlu follow-up.
- Prompt stabil dan logic AI utama dijaga di backend / modul AI. Realtime live tetap memakai trigger pendek dari desktop dan stable rules dari backend.
- Nama database, route, schema, dan beberapa file/component masih menyimpan legacy naming untuk compatibility.

## Referensi Internal

- [docs/audio-capture-windows.md](./docs/audio-capture-windows.md)
- [apps/api/src/modules/ai/PROMPTING_RULES.md](./apps/api/src/modules/ai/PROMPTING_RULES.md)
- [apps/desktop/src/features/overlay/OVERLAY_UX_RULES.md](./apps/desktop/src/features/overlay/OVERLAY_UX_RULES.md)
- [apps/desktop/src/features/overlay/CONTEXT_INTEGRITY.md](./apps/desktop/src/features/overlay/CONTEXT_INTEGRITY.md)
