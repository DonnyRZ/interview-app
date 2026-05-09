# MVP Build Spec - Interview Assistant Near Real-Time

## 1. Ringkasan Produk

MVP ini adalah desktop app Windows untuk membantu kandidat interview online agar tidak blank dan bisa menjawab dengan lebih tenang, jelas, dan meyakinkan.

Core flow saat ini:

```text
Upload CV -> Buat Application -> Masukkan Job Description -> Start Interview ->
Overlay mendengar lawan bicara via system audio -> User klik bantuan ->
AI memberi jawaban text singkat yang siap dibaca
```

Positioning:

> Asisten interview near real-time untuk membantu kandidat Indonesia saat interview kerja online.

Catatan penting:

- Fokus current build adalah Windows desktop.
- Runtime live saat ini menangkap system audio lawan bicara dulu.
- Mic user belum menjadi bagian patch utama saat ini.
- Output AI tetap text-only, bukan voice.

---

## 2. Scope MVP Saat Ini

### Yang masuk scope

1. Desktop app Electron dengan floating overlay.
2. Upload CV global/profile-level.
3. Application-level untuk company, role, dan job description.
4. Interview round: `HR`, `TECHNICAL`, `USER`, `FINAL`, `OTHER`.
5. Preprocessing CV dan JD dengan OpenAI non-live.
6. Live interview runtime dengan OpenAI Realtime.
7. Tombol bantuan:
   - `Bantu Jawab`
   - `Bantu Follow-up`
   - `Jelaskan Maksudnya`
   - free text `Ask`
8. Runtime keyword chips berbasis konteks percakapan + domain profile.
9. Response card text streaming.
10. Transcript text tersimpan saat `End Interview`.

### Yang belum masuk scope

1. Mobile app.
2. Browser extension.
3. AI voice output.
4. Menyimpan audio recording mentah.
5. Auto-answer tanpa trigger user.
6. Dual-source audio penuh user + interviewer.
7. Auth production-grade.
8. Payment/subscription production-grade.
9. Team/B2B workflow.
10. Post-interview summary/report dan UX setelah meeting selesai.

---

## 3. User Flow

### 3.1 First-time setup

```text
User buka app
-> Upload CV
-> Sistem proses CV
-> Simpan candidate summary + ready context
-> Dashboard siap dipakai
```

CV disimpan global di level profile. User tidak perlu upload CV ulang setiap interview.

Jika user upload CV baru:

```text
Upload CV baru
-> Proses ulang CV
-> CV baru menjadi active CV
-> Interview berikutnya memakai context CV terbaru
```

### 3.2 Create Application

```text
User klik New Application
-> Input nama perusahaan
-> Input posisi dilamar
-> Paste job description
-> Save Application
```

Sistem memproses JD menjadi:

- `jdSummary`
- `roleRequirements`
- `interviewPrepThemes`
- `applicationContext`
- `domainProfile`

### 3.3 Start Interview Round

```text
Pilih application
-> Start New Interview Round
-> Pilih stage
-> Start Interview
```

Saat start interview:

- overlay muncul dalam mode mini
- app membuat `realtimeContext`
- app meminta OpenAI Realtime client secret ke backend
- app membuka realtime session
- app mulai menangkap system audio lawan bicara

### 3.4 During Interview

Behavior utama yang sekarang menjadi patokan:

1. App mendengar lawan bicara sejak awal session.
2. AI tidak menjawab otomatis.
3. Bantuan hanya muncul saat user klik tombol, keyword, atau `Ask`.
4. Overlay tidak boleh bergantung hanya pada satu field pertanyaan terakhir.
5. Runtime harus memakai rolling conversation context yang fresh.
6. Jika konteks baru relevan dan keyword muncul, overlay boleh auto-expand.
7. Jika konteks fresh ada tapi tidak ada keyword, tombol bantuan tetap harus bisa dipakai.

### 3.5 Bantuan saat interview

Tombol live:

- `Bantu Jawab`
- `Bantu Follow-up`
- `Jelaskan Maksudnya`
- klik keyword
- free text `Ask`

Rule penting:

- Jangan gate bantuan hanya karena belum ada pertanyaan formal.
- Bantuan boleh dipakai saat ada konteks percakapan bermakna, termasuk statement, debat, penjelasan, atau implied question.
- Jika konteks terbaru belum tertangkap, tampilkan notice jujur. Jangan jawab dari konteks lama.

### 3.6 End Interview

Saat user klik End Interview:

```text
Stop realtime session
-> Stop audio helper
-> Simpan transcript text yang benar-benar tertangkap
-> Simpan hasil round
```

Yang disimpan current build:

- `transcriptText`
- `stageType`
- timestamp round

Catatan: `summaryJson` sudah ada di schema untuk kebutuhan setelah meeting, tetapi current `End Interview` belum otomatis membuat post-interview summary.

Yang tidak disimpan:

- audio recording mentah

---

## 4. Product Principle

Masalah utama yang ingin diselesaikan:

> Kandidat sering gagal bukan karena tidak punya skill, tetapi karena blank, gugup, atau tidak sempat menyusun jawaban dengan cepat saat interview live.

Value utama MVP:

> Memberi bantuan near real-time yang singkat, natural, dan relevan berdasarkan CV, job description, domain profile, stage interview, dan konteks percakapan terbaru.

Prinsip UX yang wajib diikuti:

- Start interview harus langsung otomatis. Jangan bebani user dengan setup audio manual yang rumit.
- Overlay mini adalah default.
- Auto-expand hanya saat ada sinyal konteks/keyword yang relevan.
- Saat user klik bantuan, loading shell harus langsung terlihat agar user tidak merasa app gagal.
- Jawaban AI harus siap dibaca, bukan coaching panjang.

---

## 5. AI & Runtime Architecture

### 5.1 Model yang dipakai

#### OpenAI non-live

- `gpt-5-mini`
  - preprocessing CV
  - preprocessing JD
  - application context / domain profile
  - post-interview summary/report saat fitur setelah meeting dibangun
  - dev harness endpoint non-live, bukan fallback runtime interview

#### OpenAI live

- `gpt-realtime-mini`
  - live runtime interview
  - context-aware help saat interview berlangsung
  - live response untuk `Bantu Jawab`, `Bantu Follow-up`, `Jelaskan Maksudnya`, keyword, dan `Ask`

#### OpenAI transcription di dalam realtime session

- `gpt-4o-mini-transcribe`
  - input audio transcription untuk session realtime
  - diarahkan ke bahasa Indonesia dengan kemungkinan istilah teknis campuran Inggris

Rule penting:

- Live interview runtime hanya mendukung `gpt-realtime-mini`.
- Tidak ada fallback diam-diam ke `gpt-realtime-1.5`.
- Tombol live interview tidak boleh diam-diam balik ke `gpt-5-mini`.
- Endpoint REST lama hanya dipertahankan sebagai dev harness, bukan jalur utama live runtime.

### 5.2 Preprocessing mode

Dipakai sebelum interview:

```text
CV PDF
-> OpenAI Responses API
-> candidate summary + ready context
-> simpan ke database
```

```text
Job Description
-> OpenAI Responses API
-> jd summary + role requirements + interview themes + domain profile
-> simpan ke database
```

Tujuan preprocessing:

- CV dan JD diproses sekali, bukan tiap klik bantuan
- runtime live tidak perlu memuat dokumen mentah
- session realtime cukup menerima context ringkas

### 5.3 Live runtime mode

Dipakai saat interview berlangsung:

```text
Electron overlay start
-> backend kirim realtime client secret
-> Electron buka WebSocket OpenAI Realtime
-> helper Windows stream system audio
-> OpenAI kirim transcription event
-> app bangun rolling conversation context
-> user klik bantuan
-> app kirim trigger pendek ke session
-> OpenAI kirim response text streaming
-> overlay render response card
```

Output live tetap text-only.

### 5.4 Realtime context

`realtimeContext` yang dikirim saat session dimulai berisi:

- `candidateContext`
  - `summary`
  - `readyContext`
  - `skills`
  - `relevantExperience`
  - `strengthsForInterview`
  - `risks`
- `applicationContext`
  - `companyName`
  - `roleTitle`
  - `jdSummary`
  - `roleRequirements`
  - `interviewPrepThemes`
  - `applicationContext`
- `domainProfile`
  - `primaryDomain`
  - `nicheDescription`
  - `inScopeConcepts`
  - `outOfScopeConcepts`
  - `seedConcepts`
  - `relevanceGuidance`
- `stageContext`
  - `stageType`
  - `focus`

### 5.5 Runtime behavior yang wajib dianggap benar

Pusat state live adalah rolling conversation context, yaitu kombinasi:

- `conversationTurns`
- `conversationWindow`
- `latestFocus`
- `lastTranscriptAt`
- `pendingSpeech`

Implikasi:

- bantuan tidak harus menunggu kalimat berbentuk pertanyaan
- keyword tidak hanya dihitung dari satu kalimat pertanyaan terakhir
- response harus memakai konteks paling baru, bukan konteks beberapa menit lalu

### 5.6 Fresh context gate

Gate bantuan yang benar:

- gunakan `hasFreshConversationContext`
- fresh context default maksimal sekitar 120 detik
- jika user klik saat speech masih berjalan, overlay boleh menunggu sekitar 1.5 detik untuk transcript final
- jika transcript baru gagal tertangkap, app harus jujur bilang konteks belum tertangkap

### 5.7 Keyword behavior

Keyword runtime dihitung dari:

- `conversationWindow`
- `latestFocus`
- `domainProfile`

Bukan dari:

- hardcoded keyword list
- pertanyaan formal saja

Rule keyword:

- keyword boleh muncul dari statement, penjelasan, debat, atau implied question
- keyword harus cukup relevan terhadap domain application
- jika keyword baru yang relevan muncul saat mode mini, overlay boleh auto-expand
- jika tidak ada keyword, bantuan tetap boleh aktif selama fresh context ada

### 5.8 Near real-time target

Near real-time tercapai karena:

1. CV dan JD diproses sebelum interview.
2. Realtime session dibuka saat `Start Interview`.
3. System audio lawan bicara di-stream sejak awal.
4. Transcript masuk sebelum user klik bantuan.
5. Saat user klik, request hanya trigger pendek dengan context terbaru.
6. Response dirender streaming.

Anti-pattern yang tidak boleh dilakukan:

- menunggu interview selesai baru membuat transcript
- mengirim ulang CV/JD mentah setiap klik bantuan
- memakai endpoint REST biasa sebagai jalur utama live
- menjawab dari konteks lama saat transcript terbaru tidak masuk
- auto-answer tanpa trigger user

### 5.9 Contoh behavior yang diharapkan

Contoh ini penting karena app tidak boleh hanya berguna untuk pertanyaan formal. App harus bisa membantu saat percakapan masih berupa statement, debat, atau implied question.

```text
Lawan bicara: Nama saya Andrian, saya suka melukis.

[AI sudah menangkap konteks percakapan ini. Walaupun belum ada pertanyaan formal, overlay seharusnya sudah punya konteks yang cukup untuk menyiapkan bantuan seperti Jelaskan Maksudnya atau Bantu Follow-up.]

Kandidat: Wah, kebetulan saya juga suka melukis. Kamu pakai AI juga?

Lawan bicara: Wah, berani banget kamu nanya begitu ke seniman. Kami benci AI.

[Di titik ini kandidat mungkin tidak langsung paham maksud lawan bicara. Jika kandidat klik Jelaskan Maksudnya, AI seharusnya menjelaskan bahwa sebagian seniman menolak AI karena karya mereka sering dipakai untuk training model tanpa izin, sehingga dianggap tidak etis dan mengancam nilai karya manusia.]

Kandidat: Wah, iya juga ya. Kalau karya seniman dipakai tanpa izin untuk training AI, itu memang terasa tidak adil.

Lawan bicara lain: Emangnya kenapa? Kalian hanya akan digantikan oleh AI. Jangan menolak teknologi. Sejarah akan setuju dengan saya. Bukankah kamu setuju?

[Di sini kandidat sedang ditekan untuk memberi tanggapan. Jika kandidat klik Bantu Jawab, AI seharusnya memberi jawaban yang siap diucapkan berdasarkan konteks terbaru percakapan, misalnya bahwa teknologi memang perlu diadaptasi, tetapi adopsinya tetap harus mempertimbangkan etika, hak kreator, dan dampaknya pada profesi manusia.]
```

Pelajaran dari contoh ini:

- AI harus menangkap konteks percakapan sejak awal, bukan menunggu pertanyaan formal.
- `Jelaskan Maksudnya` harus bisa dipakai untuk membantu memahami statement atau reaksi lawan bicara.
- `Bantu Jawab` harus merespons konteks paling baru, bukan konteks beberapa menit lalu.
- Tombol bantuan harus siap saat ada konteks percakapan bermakna, walaupun belum ada kalimat tanya yang rapi.

---

## 6. Audio Capture

Target utama saat ini adalah system audio lawan bicara di Windows.

Implementasi saat ini memakai helper WASAPI loopback.

Rule penting:

- app harus otomatis mencari active system output
- jangan hardcode nama headset, speaker, browser, atau device development
- helper harus tetap hidup saat audio silent
- helper harus bisa rescan output aktif
- awal ucapan tidak boleh terpotong saat device baru dipilih

Konsep yang sekarang dipakai:

- helper scan active render endpoint
- helper simpan rolling prebuffer sekitar 2 detik
- saat device terpilih, prebuffer langsung di-flush ke Realtime
- saat audio silent terlalu lama, helper rescan
- overlay status harus jujur: connect, searching, listening, capturing speech, ready, atau audio not captured

Current limitation:

- patch utama masih fokus system audio lawan bicara
- mic user belum masuk tahap utama

---

## 7. Desktop Packaging

### 7.1 `win-unpacked`

`win-unpacked` adalah hasil app Windows yang sudah dipackage tetapi belum menjadi installer.

Lokasi:

`apps/desktop/release/win-unpacked`

Kegunaan:

- QA versi packaged
- membandingkan perilaku dev vs packaged
- checkpoint sebelum membuat installer distribusi

Rule penting:

- `npm run build` tidak meng-update `win-unpacked`
- agar `win-unpacked` fresh, engineer harus menjalankan packaging ulang
- untuk testing packaged app yang diklik langsung di Windows, packaging ulang harus memakai beta-signed flow

Command utama untuk QA packaged app saat ini:

```powershell
npm.cmd --workspace @interview-app/desktop run package:win:beta
```

Setelah packaging beta, verifikasi signature:

```powershell
npm.cmd --workspace @interview-app/desktop run cert:beta:check
```

Jika perilaku di dev sudah benar tetapi `win-unpacked` masih terasa lama, hal pertama yang dicek adalah apakah packaging ulang sudah dijalankan.

Jangan gunakan `package:win` biasa untuk artefak yang akan diklik/test oleh owner, karena command itu menghasilkan app unsigned dan bisa diblokir Smart App Control.

### 7.2 Distribusi gratis dulu

Untuk tahap sekarang, owner produk belum ingin bergantung pada certificate komersial berbayar.

Preferensi current build:

- optimalkan flow gratis dulu
- gunakan jalur beta/self-signed untuk testing dan distribusi terbatas
- jangan langsung mengasumsikan semua friction Windows harus diselesaikan dengan membeli code signing certificate komersial

Script yang relevan:

```powershell
npm.cmd --workspace @interview-app/desktop run cert:beta:create
npm.cmd --workspace @interview-app/desktop run cert:beta:trust
npm.cmd --workspace @interview-app/desktop run package:win:beta
npm.cmd --workspace @interview-app/desktop run dist:win:beta
```

Batasan yang harus dipahami:

- self-signed beta flow cocok untuk dev, QA, dan beta terbatas
- Windows masih bisa memberi warning di mesin yang belum trust certificate
- ini bukan pengganti final public release

Namun untuk tahap sekarang, default thinking yang benar adalah: maksimalkan flow gratis dulu.

---

## 8. Tech Stack

### Desktop

- Electron
- React
- TypeScript
- Vite

### Backend

- Node.js
- Fastify

### Database

- PostgreSQL
- Drizzle ORM

### AI

- OpenAI Responses API
- OpenAI Realtime API

### Storage

- local/VPS file storage untuk CV

---

## 9. Current API Surface

### CV

```text
POST /cv/upload
GET /cv/active
GET /cv/list
POST /cv/:id/set-active
```

### Application

```text
POST /applications
GET /applications
GET /applications/:id
PATCH /applications/:id
DELETE /applications/:id
```

### Interview

```text
GET /interviews/application/:applicationId
POST /interviews/start
POST /interviews/realtime/client-secret
POST /interviews/:id/end
```

### Dev harness only

Endpoint ini hanya untuk development/non-production:

```text
POST /interviews/answer
POST /interviews/followup
POST /interviews/explain
POST /interviews/keyword-help
POST /interviews/runtime-keywords
```

Engineer tidak boleh menjadikan endpoint di atas sebagai jalur utama runtime live.

---

## 10. Data Model Ringkas

Tabel penting yang sudah relevan dengan current build:

- `candidate_cvs`
  - file CV
  - `summary_json`
  - `ready_context`
  - `processing_status`
  - `processing_error`
  - `is_active`

- `applications`
  - company name
  - role title
  - job description
  - `job_summary_json`
  - `company_context`

- `interview_rounds`
  - `stage_type`
  - `language_detected`
  - `transcript_text`
  - `summary_json`
  - `started_at`
  - `ended_at`

Bagian auth/payment/subscription production-grade belum menjadi pusat current build, jadi jangan jadikan itu asumsi utama spec ini.

---

## 11. Acceptance Criteria

### Setup

- User bisa upload CV PDF.
- CV diproses menjadi candidate summary dan ready context.
- User bisa membuat application dengan company, role, dan job description.
- JD diproses menjadi summary dan domain profile.

### Live interview

- User bisa start interview round.
- Overlay muncul mini secara default.
- Realtime session memakai `gpt-realtime-mini`.
- System audio lawan bicara mulai ditangkap otomatis.
- Transcript mulai mengisi rolling conversation context.
- Bantuan live tidak bergantung hanya pada satu field pertanyaan terakhir.
- `Bantu Jawab` menghasilkan jawaban siap dibaca dalam bullet points.
- `Bantu Follow-up` menghasilkan pertanyaan follow-up siap ucap.
- `Jelaskan Maksudnya` menjelaskan intent interviewer secara singkat.
- Keyword muncul hanya jika konteks relevan.
- Jika transcript terbaru belum tertangkap, app menampilkan notice jujur.
- End interview menyimpan transcript text. Summary/report setelah meeting belum menjadi acceptance current build.

### Packaged desktop

- `win-unpacked` bisa dibangun ulang dari source terbaru.
- Engineer bisa membedakan dengan jelas antara mode dev dan mode packaged.
- Flow gratis `beta/self-signed` tetap terdokumentasi dan bisa dipakai untuk testing terbatas.

---

## 12. Bottom Line

Yang harus dibuat dan dijaga tetap tajam untuk MVP ini adalah:

```text
CV global
-> Application dengan company + job description
-> Start interview round
-> Overlay dengar lawan bicara via system audio
-> Rolling conversation context terus diperbarui
-> User klik bantuan
-> Jawaban text cepat, ringkas, natural, dan relevan
-> Transcript tersimpan untuk dipakai post-interview workflow berikutnya
```

Fokus utama produk tetap sama:

> membantu kandidat tidak blank dan menjawab lebih meyakinkan saat interview live.
