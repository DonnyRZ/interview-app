# Orviko Meeting Assistant

Orviko adalah Web App untuk membantu user memahami percakapan online meeting dan menyiapkan respons singkat melalui floating browser overlay.

## Fokus MVP

- menangkap system audio melalui browser;
- membuat transcript near real-time;
- menampilkan satu `Latest conversation focus` terbaru yang sudah lolos quality gate;
- menghasilkan bantuan hanya ketika user menekan tombol;
- memakai profil user dan konteks meeting sebagai referensi wajib;
- menjaga setiap bantuan tetap stateless agar tidak membawa memori percakapan lama.

Empat quick action utama:

- `Jawab Pertanyaan`
- `Tanggapi`
- `Pertanyaan Follow-up`
- `Jelaskan Maksudnya`

Keyword chip dan free `Ask` juga tersedia, tetapi tidak boleh menambahkan memori ke response berikutnya.

## Arsitektur

- `apps/api`
  Fastify API untuk auth, subscription, profil, konteks meeting, sesi live, preprocessing AI, dan pembuatan Realtime client secret.

- `apps/web-app`
  Produk utama React/Vite. Menyediakan workspace, browser system-audio capture, Document Picture-in-Picture overlay, transcript, dan bantuan live.

- `apps/web`
  Landing page, pricing, checkout handoff, dan halaman legal.

- `packages/shared`
  Schema, transcript quality gate, conversation state lokal, dan kontrak prompt Realtime yang dipakai API dan Web App.

## Model AI

- `gpt-5-mini`
  Preprocessing profil dan konteks meeting serta workflow backend non-live.

- `gpt-realtime-mini`
  Runtime live dan seluruh bantuan meeting.

- `gpt-4o-mini-transcribe`
  Transcription audio live.

Tombol live tidak boleh fallback diam-diam ke model text non-live.

## Stateless Live Help

Audio dan transcript tetap berjalan di satu Realtime session, tetapi response bantuan dibuat out-of-band:

```txt
response.create
  conversation: "none"
  input:
    action
    latest accepted focus
    explicit user text jika ada
```

Profil user, konteks meeting, dan domain profile tetap tersedia dalam action-specific response instructions. Instruksi sesi audio dibuat minimal. Riwayat audio, transcript lama, keyword lama, trigger lama, dan output bantuan sebelumnya tidak menjadi input response bantuan.

Riwayat transcript lokal tetap boleh disimpan untuk rekaman sesi. Penyimpanan tersebut bukan memori AI.

## Menjalankan Project

Prasyarat:

- Node.js
- npm
- PostgreSQL
- OpenAI API key
- Chrome terbaru di Windows untuk system audio capture dan Document Picture-in-Picture

Setup:

```bash
npm install
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev:web-app
```

Landing page:

```bash
npm run dev:web
```

## Verifikasi

```bash
npm run typecheck
npm.cmd --workspace @interview-app/api run test:auth-payment
npm.cmd --workspace @interview-app/api run test:privacy
npm.cmd --workspace @interview-app/api run test:phase7
npm.cmd --workspace @interview-app/api run test:data-integrity
npm.cmd --workspace @interview-app/api run test:realtime-mvp
npm.cmd --workspace @interview-app/web-app run test:realtime
npm.cmd --workspace @interview-app/web-app run test:workspace
npm.cmd --workspace @interview-app/web-app run test:app-base
npm run build
```

## Source of Truth

- [Web App runtime rules](./apps/web-app/RUNTIME_RULES.md)
- [AI prompting rules](./apps/api/src/modules/ai/PROMPTING_RULES.md)
- [Model responsibilities](./models.md)
- [Phase 7 operational hardening](./docs/operational-hardening-phase-7.md)
