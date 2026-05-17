# Models

Dokumen ini menjelaskan model OpenAI yang saat ini dipakai di aplikasi ini, fungsi masing-masing, dan batas tanggung jawabnya berdasarkan codepath yang ada di codebase sekarang.

## Ringkasan Cepat

Saat ini ada 3 model utama yang relevan:

1. `gpt-5-mini`
2. `gpt-realtime-mini`
3. `gpt-4o-mini-transcribe`

Secara praktis:

- `gpt-5-mini` dipakai untuk workflow backend non-live.
- `gpt-realtime-mini` dipakai untuk session interview live.
- `gpt-4o-mini-transcribe` dipakai untuk transcription audio di dalam session live.

## 1. `gpt-5-mini`

### Peran utama

`gpt-5-mini` adalah model backend non-live untuk pekerjaan text-based yang tidak membutuhkan koneksi realtime ke session interview aktif.

### Dipakai untuk apa

Model ini dipakai melalui OpenAI Responses API untuk:

- preprocessing CV
- preprocessing job description
- membangun candidate summary
- membangun application context
- membangun domain / niche profile
- action backend non-live seperti:
  - `generate_interview_answer`
  - `generate_interview_followup`
  - `generate_interview_explanation`
  - `generate_interview_keyword_help`
  - `surface_realtime_keywords`

Walaupun beberapa action di atas namanya terdengar seperti fitur live interview, di backend action itu tetap termasuk jalur non-live / dev harness bila dipanggil lewat REST endpoint lama.

### Di mana dikonfigurasi

Default env:

- `OPENAI_TEXT_MODEL=gpt-5-mini`

Lokasi:

- `apps/api/src/env.ts`

### Di mana dipanggil

Jalur request non-live ada di:

- `apps/api/src/modules/ai/openai.client.ts`

Bagian penting:

- request dikirim ke `https://api.openai.com/v1/responses`
- field `model` diisi dari `env.OPENAI_TEXT_MODEL`

### Catatan penting

- Model ini bukan jalur utama untuk live interview overlay.
- Untuk current build, tombol live interview tidak boleh diam-diam fallback ke `gpt-5-mini`.

## 2. `gpt-realtime-mini`

### Peran utama

`gpt-realtime-mini` adalah model utama untuk session interview live.

Kalau disederhanakan, ini adalah "otak live copilot" yang dipakai ketika interview sedang berlangsung dan overlay aktif.

### Dipakai untuk apa

Model ini dipakai untuk:

- membuka session realtime interview
- menerima audio interview sebagai input session
- menjaga context percakapan live
- menerima trigger bantuan dari overlay
- menghasilkan response text live untuk:
  - `BANTU_JAWAB`
  - `BANTU_FOLLOWUP`
  - `JELASKAN_MAKSUDNYA`
  - `EXPLAIN_KEYWORD`
  - `ASK`

### Cara kerjanya di aplikasi

Alurnya seperti ini:

1. Backend membuat realtime client secret.
2. Session realtime dikonfigurasi dengan model `gpt-realtime-mini`.
3. Electron / overlay membuka WebSocket ke OpenAI Realtime API.
4. Audio interviewer dikirim ke session itu.
5. Saat user klik tombol bantuan, overlay mengirim trigger text ke session yang sama.
6. Session realtime mengembalikan response text streaming.

### Di mana dikonfigurasi

Default env:

- `OPENAI_REALTIME_MODEL=gpt-realtime-mini`

Lokasi:

- `apps/api/src/env.ts`

### Di mana dipakai

Backend:

- `apps/api/src/modules/interviews/interview-realtime.service.ts`
- `apps/api/src/modules/ai/openai.client.ts`

Desktop / Electron:

- `apps/desktop/electron/main.ts`
- `apps/desktop/src/features/overlay/InterviewOverlay.tsx`

### Instruksi model live

Session realtime ini tidak dibiarkan "kosong". Ia diberi instruksi khusus tentang bagaimana membantu kandidat interview, termasuk:

- jangan menjawab otomatis tanpa trigger user
- untuk intro / background pakai CV secara hati-hati
- untuk technical question boleh jawab langsung tanpa memaksakan CV / JD
- untuk closing follow-up gunakan JD / nice-to-have dengan hati-hati
- format jawaban harus ringkas dan siap diucapkan

Lokasi builder instruksi:

- `apps/api/src/modules/ai/actions/realtime-interview-session.ts`

### Guardrail penting

Codebase secara eksplisit mengunci live runtime ke model ini:

- jika `OPENAI_REALTIME_MODEL` bukan `gpt-realtime-mini`, backend melempar error
- Electron juga memvalidasi bahwa payload connect memang `gpt-realtime-mini`

Artinya:

- tidak ada fallback diam-diam ke `gpt-realtime-1.5`
- tidak ada fallback diam-diam ke `gpt-5-mini` untuk tombol live

## 3. `gpt-4o-mini-transcribe`

### Peran utama

`gpt-4o-mini-transcribe` adalah model transcription audio.

Kalau `gpt-realtime-mini` adalah "otak live copilot", maka `gpt-4o-mini-transcribe` adalah "telinga / speech-to-text" untuk audio interview.

### Dipakai untuk apa

Model ini dipakai untuk:

- mengubah audio interviewer menjadi transcript text
- menghasilkan event transcript incremental dan final
- memberi bahan context terbaru ke overlay dan session logic

### Hal yang tidak dilakukan model ini

Model ini tidak dipakai untuk:

- menyusun jawaban interview
- memilih strategi jawaban
- membuat follow-up
- menjelaskan maksud interviewer

Semua tugas di atas berada di layer session realtime / response generation, bukan di layer transcription.

### Di mana dikonfigurasi

Konfigurasi ada di realtime client secret payload:

- `audio.input.transcription.model = "gpt-4o-mini-transcribe"`

Lokasi:

- `apps/api/src/modules/ai/openai.client.ts`

### Prompt transcription

Prompt transcription juga terpisah dan sangat sempit scope-nya:

- audio interview kerja berbahasa Indonesia
- istilah teknis / tools / produk bisa bercampur Inggris
- pertahankan bahasa asli semaksimal mungkin

Lokasi:

- `apps/api/src/modules/ai/actions/realtime-interview-transcription.ts`

### Output di frontend

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

Ini perbedaan paling penting di runtime live:

### `gpt-4o-mini-transcribe`

Tugasnya:

- dengar audio
- ubah audio jadi teks

Output utamanya:

- transcript

### `gpt-realtime-mini`

Tugasnya:

- pahami context interview
- baca transcript terbaru
- terima trigger bantuan dari user
- hasilkan jawaban / explanation / follow-up dalam bentuk text streaming

Output utamanya:

- bantuan interview live

### Analogi sederhana

- `gpt-4o-mini-transcribe` = pendengar / penulis notulen live
- `gpt-realtime-mini` = copilot yang memakai notulen itu untuk membantu menjawab

## Jalur Fitur Berdasarkan Model

### Upload CV

Model:

- `gpt-5-mini`

Tugas:

- ekstraksi isi CV
- candidate summary
- ready context

### Create Application / Process JD

Model:

- `gpt-5-mini`

Tugas:

- jd summary
- role requirements
- responsibilities
- nice-to-have
- domain profile

### Start Interview Live

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

- ubah audio interviewer jadi transcript

### Tombol Live Overlay

Contoh:

- `Bantu Jawab`
- `Bantu Follow-up`
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

- route ini bukan jalur utama runtime live interview

## Batasan dan Rule Penting

### Rule 1

Live interview runtime saat ini hanya mendukung `gpt-realtime-mini`.

### Rule 2

Transcription audio live saat ini memakai `gpt-4o-mini-transcribe`.

### Rule 3

Workflow preprocessing CV / JD dan action backend non-live saat ini memakai `gpt-5-mini`.

### Rule 4

Tombol bantuan live tidak boleh diam-diam fallback ke `gpt-5-mini`.

## Checklist Cepat

Kalau ada engineer baru yang ingin paham cepat:

- mau cek model preprocessing CV / JD: lihat `OPENAI_TEXT_MODEL`
- mau cek model live session: lihat `OPENAI_REALTIME_MODEL`
- mau cek model transcription audio: lihat `audio.input.transcription.model`
- mau cek siapa yang benar-benar menjawab di live overlay: lihat flow `conversation.item.create` + `response.create` di overlay WebSocket

## Bottom Line

Pembagian tanggung jawab model saat ini adalah:

- `gpt-5-mini` untuk backend non-live
- `gpt-realtime-mini` untuk brain session interview live
- `gpt-4o-mini-transcribe` untuk telinga / speech-to-text live

Kalau ada kebingungan, aturan paling aman adalah:

- kalau tugasnya preprocessing atau action backend biasa, pikirkan `gpt-5-mini`
- kalau tugasnya session interview aktif dan menghasilkan bantuan live, pikirkan `gpt-realtime-mini`
- kalau tugasnya mengubah audio menjadi transcript, pikirkan `gpt-4o-mini-transcribe`

## Pricing Resmi dan Cara Hitung

Bagian ini merangkum pricing resmi OpenAI untuk model yang dipakai aplikasi ini, lalu menerjemahkannya ke rumus hitung biaya yang bisa dipakai untuk estimasi per request atau per menit.

Semua angka di bawah harus dianggap sebagai snapshot dokumentasi resmi OpenAI yang saya cek pada 13 Mei 2026. Kalau nanti OpenAI mengubah harga, angka di sini juga harus ikut diperbarui.

## Pricing per model

### `gpt-5-mini`

Sumber resmi:

- https://developers.openai.com/api/docs/models/gpt-5-mini

Harga text token:

- input: `$0.25 / 1M tokens`
- cached input: `$0.025 / 1M tokens`
- output: `$2.00 / 1M tokens`

Karena model ini dipakai lewat Responses API untuk workflow non-live, biaya dasarnya dihitung dari token text biasa:

`cost = (input_tokens / 1_000_000 * 0.25) + (cached_input_tokens / 1_000_000 * 0.025) + (output_tokens / 1_000_000 * 2.00)`

### `gpt-realtime-mini`

Sumber resmi:

- https://developers.openai.com/api/docs/models/gpt-realtime-mini
- https://platform.openai.com/docs/pricing
- https://platform.openai.com/docs/guides/realtime-costs

Harga text token:

- input text: `$0.60 / 1M tokens`
- cached input text: `$0.06 / 1M tokens`
- output text: `$2.40 / 1M tokens`

Harga audio token:

- input audio: `$10.00 / 1M tokens`
- cached input audio: `$0.30 / 1M tokens`
- output audio: `$20.00 / 1M tokens`

Untuk Realtime API, docs resmi juga menjelaskan konversi audio ke token:

- audio user message: `1 token per 100 ms`
- audio assistant message: `1 token per 50 ms`

Artinya:

- audio user input: `10 token/detik` = `600 token/menit`
- audio assistant output: `20 token/detik` = `1200 token/menit`

Kalau dihitung ke biaya murni audio:

- input audio realtime per menit: `600 / 1_000_000 * 10 = $0.006 / menit`
- output audio realtime per menit: `1200 / 1_000_000 * 20 = $0.024 / menit`

Tetapi ada fakta penting untuk aplikasi ini:

- di `apps/api/src/modules/ai/openai.client.ts`, session realtime diset `output_modalities: ["text"]`
- jadi build sekarang tidak memakai audio output dari assistant

Implikasinya:

- biaya `output audio` realtime saat ini seharusnya `0`
- biaya realtime yang relevan di app sekarang adalah:
  - input audio realtime
  - input text ke response
  - cached input text/audio kalau cache kena
  - output text response

Rumus umum realtime:

`cost = text_input + text_cached_input + text_output + audio_input + audio_cached_input + audio_output`

Dengan breakdown:

- `text_input = input_text_tokens / 1_000_000 * 0.60`
- `text_cached_input = cached_text_tokens / 1_000_000 * 0.06`
- `text_output = output_text_tokens / 1_000_000 * 2.40`
- `audio_input = input_audio_tokens / 1_000_000 * 10.00`
- `audio_cached_input = cached_audio_tokens / 1_000_000 * 0.30`
- `audio_output = output_audio_tokens / 1_000_000 * 20.00`

Untuk current build app ini, rumus praktisnya lebih tepat disederhanakan menjadi:

`current_live_cost = text_input + text_cached_input + text_output + audio_input + audio_cached_input`

karena `audio_output = 0`.

### `gpt-4o-mini-transcribe`

Sumber resmi:

- https://platform.openai.com/docs/models/gpt-4o-mini-transcribe
- https://platform.openai.com/docs/pricing

Harga token:

- input text: `$1.25 / 1M tokens`
- output text: `$5.00 / 1M tokens`
- input audio: `$3.00 / 1M tokens`

Pricing page OpenAI juga memberi estimasi langsung:

- estimated cost: `$0.003 / minute`

Untuk model transcribe ini, docs pricing yang saya cek tidak menampilkan rule eksplisit seperti realtime guide yang bilang `1 token per 100 ms`. Jadi untuk transcribe, cara paling aman adalah:

1. kalau tersedia usage token asli dari response/event, pakai angka usage itu
2. kalau belum ada usage detail dan butuh estimasi kasar, pakai angka resmi `$0.003 / minute`

Kalau kita balik dari angka resmi itu:

- `$3.00 / 1M audio tokens` berarti `$0.000003 / token`
- `$0.003 / minute` dibagi `$0.000003 / token` = sekitar `1000 audio token / menit`

Jadi:

- `~1000 input audio token / menit`
- `~16.67 token / detik`
- `~1 token / 60 ms`

Penting:

- angka `~1 token / 60 ms` untuk `gpt-4o-mini-transcribe` adalah inferensi matematis dari pricing resmi, bukan rule eksplisit yang saya lihat tertulis di docs seperti pada Realtime API

## Cara membaca biaya di aplikasi ini

Secara arsitektur, aplikasi ini punya dua komponen biaya live yang berjalan bersamaan:

### 1. Biaya session `gpt-realtime-mini`

Komponen ini dipakai untuk:

- menyimpan conversation state realtime
- menerima audio ke session
- menerima prompt action dari tombol overlay
- menghasilkan jawaban text streaming

Yang perlu diingat:

- Realtime API tidak mengenakan biaya hanya karena koneksi WebSocket terbuka
- biaya muncul ketika `Response` dibuat
- docs resmi juga menyebut tidak ada biaya khusus untuk bandwidth atau connection itu sendiri

Ini sangat penting untuk codebase ini karena:

- `turn_detection.create_response = false`
- overlay baru memanggil `response.create` saat user menekan tombol seperti `Bantu Jawab`, `Bantu Follow-up`, `Jelaskan Maksudnya`, atau `Ask`

Artinya:

- biaya response model tidak berjalan terus-menerus hanya karena sesi realtime sedang connect
- tetapi audio transcription tetap bisa berjalan saat audio di-commit

### 2. Biaya transcription `gpt-4o-mini-transcribe`

Komponen ini dipakai untuk:

- mengubah audio interviewer menjadi transcript

Biayanya terpisah dari biaya response realtime, karena transcription memakai model lain dan rate card lain.

Jadi dalam satu sesi interview live, total biaya yang relevan biasanya:

`total_live_cost = realtime_cost + transcription_cost`

## Estimasi kasar per menit untuk build saat ini

Karena app ini:

- memakai `gpt-realtime-mini` untuk live runtime
- memakai `gpt-4o-mini-transcribe` untuk transcription
- tidak memakai audio output assistant

maka baseline kasar listening cost per menit adalah:

### Realtime input audio

- `600 token/menit * $10 / 1M = $0.006 / menit`

### Transcription

- official estimate `~$0.003 / menit`

### Baseline gabungan

- `~$0.009 / menit`

Ini baru baseline audio-listening.

Belum termasuk:

- input text prompt yang dikirim saat user menekan tombol bantuan
- output text jawaban model
- token conversation history yang ikut terkirim ulang ke response berikutnya
- efek cache input

Jadi biaya nyata per sesi bisa lebih tinggi dari baseline itu, terutama kalau:

- user sering menekan tombol bantuan
- transcript/history makin panjang
- output jawaban model cukup panjang

## Kenapa durasi tidak selalu sama dengan token

Ada beberapa alasan:

- untuk text, token tergantung isi kata, bukan durasi
- untuk realtime audio, durasi bisa dikonversi cukup jelas karena docs memberi aturan token per ms
- untuk transcribe, docs memberi estimasi biaya per menit, tetapi tidak selalu berarti setiap menit audio akan menghasilkan jumlah text token output yang sama
- token usage final juga bisa sedikit berbeda karena adanya special tokens / metadata internal yang disebut di docs realtime costs

Jadi aturan amannya:

- untuk `gpt-realtime-mini` audio input, durasi ke token bisa dipetakan cukup percaya diri
- untuk `gpt-4o-mini-transcribe`, estimasi durasi ke token sebaiknya dianggap pendekatan kasar kecuali kita membaca field `usage` nyata dari event atau response
- untuk `gpt-5-mini`, tidak ada konversi durasi yang bermakna karena model ini text-only di app ini

## Rumus Estimasi yang Paling Berguna

### A. Estimasi transcription saja dari durasi

Kalau mau estimasi cepat transcription cost:

`transcription_cost_estimate_usd = durasi_menit * 0.003`

### B. Estimasi realtime audio input saja dari durasi

Kalau mau estimasi cepat realtime listening cost:

`realtime_audio_input_cost_usd = durasi_menit * 0.006`

### C. Estimasi baseline live total dari durasi

Untuk build sekarang, sebelum menghitung prompt dan jawaban text:

`baseline_live_total_usd = durasi_menit * 0.009`

### D. Estimasi lebih lengkap live session

`full_live_cost = (durasi_menit * 0.006) + (durasi_menit * 0.003) + biaya_text_prompt + biaya_text_output - penghematan_cache`

## Implikasi khusus untuk app ini

Kalau tujuan kita nanti adalah membuat billing estimator atau cost dashboard, maka cara paling benar adalah memisahkan:

1. transcription minutes / audio tokens
2. realtime audio input tokens
3. realtime text input tokens
4. realtime text output tokens
5. cached tokens

Dan untuk codebase ini, metrik yang paling penting dipantau adalah:

- berapa menit audio interviewer yang benar-benar masuk transcription
- berapa kali user menekan tombol bantuan
- rata-rata panjang transcript window yang ikut dikirim ke action prompt
- rata-rata panjang jawaban text model

Tanpa pemisahan itu, biaya live akan terlihat membingungkan karena transcription dan realtime response memang berjalan di dua model yang berbeda.

## Catatan Audit

Yang eksplisit dari dokumentasi resmi OpenAI:

- harga per 1M token untuk `gpt-5-mini`
- harga per 1M text token untuk `gpt-realtime-mini`
- harga per 1M audio token untuk `gpt-realtime-mini`
- harga per 1M token dan estimated `$0.003 / minute` untuk `gpt-4o-mini-transcribe`
- aturan Realtime API bahwa audio user message adalah `1 token per 100 ms`
- aturan Realtime API bahwa audio assistant message adalah `1 token per 50 ms`
- Realtime API tidak mengenakan biaya hanya karena connection terbuka; biaya muncul saat response dibuat, dan transcription dibilling terpisah

Yang merupakan inferensi saya dari angka resmi:

- `gpt-4o-mini-transcribe` kira-kira `~1000 audio token / menit`
- itu setara kira-kira `~1 token / 60 ms`
- baseline current build `~$0.009 / menit` sebelum token text prompt/output
