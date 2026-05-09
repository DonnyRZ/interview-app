# Interview App

Desktop application untuk membantu kandidat saat interview online dengan overlay AI yang muncul di atas meeting, video, atau browser.

Fokus utama aplikasi ini:

- membantu kandidat tetap tenang saat interview
- menangkap konteks interview secara near real-time
- memberi bantuan jawaban dalam bentuk teks, bukan auto-speaking
- menjaga bantuan tetap relevan dengan profil kandidat, role, dan domain pekerjaan

## Gambaran Singkat

Alur kerja aplikasi secara umum:

1. User upload CV.
2. User membuat application untuk company dan role yang dilamar.
3. Sistem membangun context kandidat, role, dan domain interview.
4. User memulai sesi interview.
5. Overlay mulai listening otomatis.
6. Saat interviewer bicara, transcript dan context runtime diperbarui.
7. User bisa meminta bantuan seperti:
   - `Bantu Jawab`
   - `Bantu Follow-up`
   - `Jelaskan Maksudnya`
   - `Ask`

Aplikasi ini tidak dirancang untuk menjawab otomatis tanpa aksi user. User tetap memegang kontrol kapan bantuan AI dimunculkan.

## Arsitektur

Project ini memakai monorepo sederhana:

- `apps/api`
  Backend API berbasis Fastify. Menangani data application/interview, preprocessing AI, dan pembuatan realtime client secret.

- `apps/desktop`
  Desktop app berbasis Electron + React. Menyediakan dashboard, flow interview, dan floating overlay.

- `packages/shared`
  Shared schema dan type yang dipakai lintas backend dan desktop.

## Kemampuan Utama

- upload dan proses CV
- membuat application per company/role
- menyusun interview context dari kandidat + role + domain
- memulai sesi interview dengan floating overlay
- menangkap system audio pada Windows melalui WASAPI loopback helper
- menjalankan live runtime dengan `gpt-realtime-mini`
- menampilkan bantuan jawaban berbasis trigger user
- menyimpan transcript text sebagai bahan post-interview workflow berikutnya

## Model AI

Saat ini pembagian peran model secara umum:

- `gpt-5-mini`
  Dipakai untuk proses non-live seperti preprocessing CV, ringkasan JD/context, dan workflow text backend lainnya.

- `gpt-realtime-mini`
  Dipakai untuk sesi interview live yang membutuhkan audio input, transcript runtime, dan bantuan overlay near real-time.

## UX Interview

Saat user klik `Start Interview`:

- overlay dibuka
- listening dimulai otomatis
- app menyiapkan realtime session
- system audio dipakai untuk menangkap suara interviewer

Selama interview:

- overlay mode mini dipakai untuk keadaan pasif
- overlay bisa expand saat context sudah cukup relevan
- bantuan AI hanya muncul ketika user menekan tombol bantuan atau mengirim ask manual

## Tech Stack

- Electron
- React
- Vite
- Fastify
- Zod
- Drizzle ORM
- PostgreSQL
- OpenAI API

## Menjalankan Project

### Prasyarat

- Node.js
- npm
- Docker Desktop
- PostgreSQL melalui `docker-compose`
- OpenAI API key
- Windows untuk flow system audio loopback saat interview live

### Setup

1. Copy `.env.example` menjadi `.env`
2. Isi `OPENAI_API_KEY`
3. Jalankan database:

```bash
docker compose up -d
```

4. Jalankan migration bila diperlukan:

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
npm run build
npm run typecheck
npm run db:migrate
npm run db:seed:dev
```

## Catatan

- Flow live interview saat ini ditujukan untuk desktop Windows karena audio capture memakai WASAPI loopback helper.
- Overlay didesain untuk membantu, bukan menggantikan kandidat.
- Prompt stabil dan logic AI utama dijaga di backend / modul AI. Current Realtime live masih punya pengecualian kecil di overlay untuk trigger action pendek; detailnya ada di `PROMPTING_RULES.md`.

## Referensi Internal

- [mvp_build_spec.md](./mvp_build_spec.md)
- [mockup/interactive_mvp_mockup.html](./mockup/interactive_mvp_mockup.html)
- [docs/audio-capture-windows.md](./docs/audio-capture-windows.md)
- [apps/desktop/WIN_UNPACKED.md](./apps/desktop/WIN_UNPACKED.md)
- [apps/api/src/modules/ai/PROMPTING_RULES.md](./apps/api/src/modules/ai/PROMPTING_RULES.md)
