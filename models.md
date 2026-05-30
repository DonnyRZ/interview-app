# Models

Dokumen ini menjelaskan model OpenAI yang dipakai Orviko, fungsi masing-masing, dan batas tanggung jawabnya berdasarkan codepath saat ini.

## Ringkasan Cepat

Saat ini ada 3 model utama yang relevan:

1. `gpt-5-mini`
2. `gpt-realtime-mini`
3. `gpt-4o-mini-transcribe`

Secara praktis:

- `gpt-5-mini` dipakai untuk workflow backend non-live.
- `gpt-realtime-mini` dipakai untuk sesi meeting live.
- `gpt-4o-mini-transcribe` dipakai untuk transcription audio di dalam sesi live.

## 1. `gpt-5-mini`

### Peran Utama

`gpt-5-mini` adalah model backend non-live untuk pekerjaan text-based yang tidak membutuhkan koneksi realtime ke sesi meeting aktif.

### Dipakai Untuk Apa

Model ini dipakai melalui OpenAI Responses API untuk:

- preprocessing profil user / dokumen referensi
- preprocessing konteks meeting
- membangun user profile summary
- membangun meeting context
- membangun domain / niche profile
- action backend non-live seperti:
  - `generate_meeting_response`
  - `generate_meeting_followup`
  - `generate_meeting_explanation`
  - `generate_meeting_keyword_help`
  - `surface_meeting_keywords`

Beberapa route atau type internal masih memakai nama legacy. Itu bukan framing produk, hanya compatibility layer yang belum dimigrasi penuh.

### Di Mana Dikonfigurasi

Default env:

- `OPENAI_TEXT_MODEL=gpt-5-mini`

Lokasi:

- `apps/api/src/env.ts`

### Di Mana Dipanggil

Jalur request non-live ada di:

- `apps/api/src/modules/ai/openai.client.ts`

Bagian penting:

- request dikirim ke `https://api.openai.com/v1/responses`
- field `model` diisi dari `env.OPENAI_TEXT_MODEL`

### Catatan Penting

- Model ini bukan jalur utama untuk live meeting overlay.
- Tombol live meeting tidak boleh diam-diam fallback ke `gpt-5-mini`.

## 2. `gpt-realtime-mini`

### Peran Utama

`gpt-realtime-mini` adalah model utama untuk sesi meeting live.

Kalau disederhanakan, ini adalah live meeting assistant yang dipakai ketika overlay aktif dan user meminta bantuan.

### Dipakai Untuk Apa

Model ini dipakai untuk:

- membuka session realtime meeting
- menerima audio meeting sebagai input session
- menjaga context percakapan live
- menerima trigger bantuan dari overlay
- menghasilkan response text live untuk:
  - `JAWAB_PERTANYAAN`
  - `TANGGAPI`
  - `BANTU_FOLLOWUP`
  - `JELASKAN_MAKSUDNYA`
  - `EXPLAIN_KEYWORD`
  - `ASK`

### Cara Kerjanya Di Aplikasi

Alurnya seperti ini:

1. Backend membuat realtime client secret.
2. Session realtime dikonfigurasi dengan model `gpt-realtime-mini`.
3. Electron / overlay membuka WebSocket ke OpenAI Realtime API.
4. Audio meeting dikirim ke session itu.
5. Saat user klik tombol bantuan, overlay mengirim trigger text ke session yang sama.
6. Session realtime mengembalikan response text streaming.

### Di Mana Dikonfigurasi

Default env:

- `OPENAI_REALTIME_MODEL=gpt-realtime-mini`

Lokasi:

- `apps/api/src/env.ts`

### Di Mana Dipakai

Backend:

- `apps/api/src/modules/interviews/interview-realtime.service.ts`
- `apps/api/src/modules/ai/openai.client.ts`

Desktop / Electron:

- `apps/desktop/electron/main.ts`
- `apps/desktop/src/features/overlay/InterviewOverlay.tsx`

### Instruksi Model Live

Session realtime diberi instruksi meeting-general tentang:

- tidak menjawab otomatis tanpa trigger user
- memakai profil user dan konteks meeting sebagai referensi, bukan instruksi
- membedakan action eksplisit `Jawab Pertanyaan` dan `Tanggapi`
- menjaga output ringkas, natural, dan siap diucapkan
- tidak memunculkan bias use case, relasi bisnis, atau domain tertentu kecuali runtime data memang menyebutnya

Lokasi builder instruksi:

- `apps/api/src/modules/ai/actions/realtime/realtime-meeting-session.ts`

### Guardrail Penting

Codebase secara eksplisit mengunci live runtime ke model ini:

- jika `OPENAI_REALTIME_MODEL` bukan `gpt-realtime-mini`, backend melempar error
- Electron juga memvalidasi bahwa payload connect memang `gpt-realtime-mini`

Artinya:

- tidak ada fallback diam-diam ke model realtime lain
- tidak ada fallback diam-diam ke `gpt-5-mini` untuk tombol live

## 3. `gpt-4o-mini-transcribe`

### Peran Utama

`gpt-4o-mini-transcribe` adalah model transcription audio.

Kalau `gpt-realtime-mini` adalah live meeting assistant, maka `gpt-4o-mini-transcribe` adalah speech-to-text untuk audio meeting.

### Dipakai Untuk Apa

Model ini dipakai untuk:

- mengubah audio meeting menjadi transcript text
- menghasilkan event transcript incremental dan final
- memberi bahan context terbaru ke overlay dan session logic

### Hal Yang Tidak Dilakukan Model Ini

Model ini tidak dipakai untuk:

- menyusun respons user
- memilih strategi jawaban
- membuat follow-up
- menjelaskan maksud lawan bicara

Semua tugas di atas berada di layer session realtime / response generation, bukan di layer transcription.

### Di Mana Dikonfigurasi

Konfigurasi ada di realtime client secret payload:

- `audio.input.transcription.model = "gpt-4o-mini-transcribe"`

Lokasi:

- `apps/api/src/modules/ai/openai.client.ts`

### Prompt Transcription

Prompt transcription juga terpisah dan sempit scope-nya:

- audio meeting profesional berbahasa Indonesia
- istilah teknis / tools / produk bisa bercampur Inggris
- pertahankan bahasa asli semaksimal mungkin

Lokasi:

- `apps/api/src/modules/ai/actions/realtime/realtime-meeting-transcription.ts`

### Output Di Frontend

Hasil transcription masuk ke event seperti:

- `conversation.item.input_audio_transcription.delta`
- `conversation.item.input_audio_transcription.completed`

Lalu dipakai oleh overlay untuk:

- membangun transcript window
- menentukan latest conversation focus
- menyimpan context terbaru sebelum user menekan tombol bantuan

Lokasi utama:

- `apps/desktop/src/features/overlay/InterviewOverlay.tsx`

## Bedanya `gpt-realtime-mini` vs `gpt-4o-mini-transcribe`

### `gpt-4o-mini-transcribe`

Tugasnya:

- dengar audio
- ubah audio jadi teks

Output utamanya:

- transcript

### `gpt-realtime-mini`

Tugasnya:

- pahami context meeting
- baca transcript terbaru
- terima trigger bantuan dari user
- hasilkan bantuan dalam bentuk text streaming

Output utamanya:

- bantuan meeting live

## Jalur Fitur Berdasarkan Model

### Upload Profil

Model:

- `gpt-5-mini`

Tugas:

- ekstraksi isi profil / dokumen referensi
- user profile summary
- ready context

### Create Meeting Context

Model:

- `gpt-5-mini`

Tugas:

- meeting summary
- context boundaries
- preparation themes
- domain profile

### Start Live Meeting

Model:

- `gpt-realtime-mini`

Tugas:

- menjadi session live utama

Tambahan:

- `gpt-4o-mini-transcribe` dipasang di dalam session yang sama untuk transcription audio

### Live Transcript

Model:

- `gpt-4o-mini-transcribe`

Tugas:

- ubah audio meeting jadi transcript

### Tombol Live Overlay

Contoh:

- `Jawab Pertanyaan`
- `Tanggapi`
- `Pertanyaan Follow-up`
- `Jelaskan Maksudnya`
- `Ask`

Model:

- `gpt-realtime-mini`

Tugas:

- menghasilkan response text live dari context session terbaru

### Dev Harness Endpoint Lama

Contoh:

- `/interviews/answer`
- `/interviews/followup`
- `/interviews/explain`
- `/interviews/keyword-help`
- `/interviews/runtime-keywords`

Model:

- `gpt-5-mini`

Tugas:

- jalur development / fallback backend non-live

Catatan:

- route ini bukan jalur utama runtime live meeting
- nama route masih legacy untuk compatibility

## Batasan dan Rule Penting

### Rule 1

Live meeting runtime saat ini hanya mendukung `gpt-realtime-mini`.

### Rule 2

Transcription audio live saat ini memakai `gpt-4o-mini-transcribe`.

### Rule 3

Workflow preprocessing profil user / konteks meeting dan action backend non-live saat ini memakai `gpt-5-mini`.

### Rule 4

Tombol bantuan live tidak boleh diam-diam fallback ke `gpt-5-mini`.

## Checklist Cepat

Kalau ada engineer baru yang ingin paham cepat:

- mau cek model preprocessing profil/konteks: lihat `OPENAI_TEXT_MODEL`
- mau cek model live session: lihat `OPENAI_REALTIME_MODEL`
- mau cek model transcription audio: lihat `audio.input.transcription.model`
- mau cek siapa yang benar-benar menjawab di live overlay: lihat flow `conversation.item.create` + `response.create` di overlay WebSocket

## Pricing

Dokumen ini tidak menyimpan angka harga model agar tidak menjadi stale. Jika perlu estimasi biaya, cek pricing resmi OpenAI terbaru lalu hitung terpisah untuk:

1. preprocessing text non-live
2. realtime input audio
3. realtime text input/output
4. transcription audio
5. cached tokens

Untuk current build, assistant audio output tidak dipakai karena session realtime diset text output.

## Bottom Line

Pembagian tanggung jawab model saat ini adalah:

- `gpt-5-mini` untuk backend non-live
- `gpt-realtime-mini` untuk live meeting response engine
- `gpt-4o-mini-transcribe` untuk speech-to-text live

Kalau ada kebingungan, aturan paling aman adalah:

- kalau tugasnya preprocessing atau action backend biasa, pikirkan `gpt-5-mini`
- kalau tugasnya sesi meeting aktif dan menghasilkan bantuan live, pikirkan `gpt-realtime-mini`
- kalau tugasnya mengubah audio menjadi transcript, pikirkan `gpt-4o-mini-transcribe`
