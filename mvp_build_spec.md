# MVP Build Spec — Interview Assistant Real-Time

## 1. Ringkasan Produk

MVP ini adalah desktop app untuk membantu kandidat interview online agar tidak blank dan bisa menjawab pertanyaan dengan lebih tenang, jelas, dan meyakinkan.

Core flow:

```text
Upload CV → Buat Application → Masukkan JD → Start Interview → Overlay mendengar interviewer → User klik bantuan → AI memberi jawaban singkat
```

Positioning awal:

> Asisten interview real-time untuk membantu kandidat Indonesia menjawab lebih tenang, jelas, dan meyakinkan saat interview kerja.

---

## 2. Scope MVP

### Yang dibuat di MVP

1. Desktop app dengan floating overlay.
2. Upload CV global/profile-level.
3. Application-level untuk company, role, dan job description.
4. Interview round: HR, Technical, User, Final.
5. Gemini untuk proses CV/JD menjadi summary.
6. Gemini Live untuk mendengar interview secara real-time.
7. Tombol bantuan:
   - Bantu Jawab
   - Bantu Follow-up
   - Jelaskan Maksudnya
   - Free text ask
8. Keyword chips penting/niche.
9. Response card berisi jawaban text.
10. Transcript text + post-interview summary.
11. Payment Midtrans.

### Yang tidak dibuat dulu

1. Mobile app.
2. Browser extension.
3. AI voice output.
4. Simpan audio recording.
5. Auto-answer tanpa klik user.
6. Calendar integration.
7. Analytics kompleks.
8. Multi-CV advanced workflow.
9. Team/B2B features.

---

## 3. User Flow Final

### 3.1 First-time setup

```text
User register/login
→ Upload CV
→ Sistem proses CV
→ Simpan candidate summary
→ Dashboard siap digunakan
```

CV disimpan secara global di level profile. User tidak perlu upload CV setiap interview.

Jika user update CV:

```text
Upload CV baru
→ Proses ulang CV
→ CV baru menjadi active CV
→ Interview berikutnya memakai summary CV terbaru
```

CV lama tetap disimpan sebagai version history agar interview lama tetap punya konteks CV yang benar.

---

### 3.2 Create Application

```text
User klik New Application
→ Input nama perusahaan
→ Input posisi dilamar
→ Paste job description
→ Pilih CV aktif
→ Save Application
```

Contoh:

```text
Company: Tokopedia
Role: Marketing Associate
JD: [job description]
CV: Siti_CV_Mei.pdf
```

Sistem memproses JD menjadi job summary dan application context.

---

### 3.3 Start Interview Round

Dari application yang sudah ada:

```text
Tokopedia — Marketing Associate
→ Start New Interview Round
→ Pilih stage: HR / Technical / User / Final
→ Start Interview
```

Jika Siti lanjut dari HR ke Technical/User, tidak perlu input JD ulang. Cukup pilih application yang sama dan stage berbeda.

---

### 3.4 During Interview

Saat interview dimulai:

```text
Overlay default: mini
Status: Siap membantu
Gemini Live mulai mendengar suara interviewer
```

Behavior utama:

1. App fokus mendengar interviewer.
2. AI tidak menjawab otomatis.
3. Jawaban hanya muncul saat user klik tombol, keyword, shortcut, atau free text.
4. Kalau keyword penting muncul, overlay otomatis berubah ke expanded.
5. Kalau tidak ada keyword penting, overlay tetap mini.
6. User bisa toggle manual mini ↔ expanded.

---

### 3.5 Keyword chips

Keyword chips hanya muncul kalau penting dan relevan dengan konteks niche interview.

Revisi logika keyword:

```text
CV + JD -> domain/niche profile
domain/niche profile + interviewer transcript live -> AI relevance check
Jika relevan dengan niche -> munculkan 1-3 keyword
Jika keluar domain atau terlalu generik -> jangan munculkan keyword
```

Contoh:

```text
Domain/niche: crypto trading content
Interviewer: "konten kamu ada CTA" -> []
Interviewer: "bull market bitcoin tahun ini" -> ["bull market", "bitcoin"]
```

Rule tambahan:

```text
Jika keyword generik → jangan tampilkan
Jika keyword menarik tapi out-of-domain → jangan tampilkan
Jika keyword niche/relevan dengan domain_profile → tampilkan
Jika tidak yakin → jangan tampilkan
Maksimal 3 keyword per detection
```

Catatan: "niche/relevan" selalu berarti relevan terhadap domain_profile application, bukan relevan secara umum.

Saat keyword penting terdeteksi:

```text
Mini overlay → otomatis expanded
Tampilkan keyword chips
User bisa klik keyword untuk minta bantuan spesifik
```

---

### 3.6 Response behavior

Saat user klik bantuan:

```text
User klik Bantu Jawab / keyword / free text
→ Response Card muncul
→ Jawaban dalam bentuk point-based text
```

Format jawaban:

- Tidak 1 paragraf panjang.
- Berbentuk poin fleksibel.
- Tidak wajib 3 poin.
- Harus natural dan bisa langsung diucapkan.
- Bahasa mengikuti bahasa interview: Indonesia atau English.

Contoh output:

```text
- Saya akan mulai dari memahami target audience dan pain point mereka.
- Setelah itu saya tentukan funnel dari awareness, consideration, sampai conversion.
- Untuk mengukur hasilnya, saya lihat metrik seperti CTR, conversion rate, dan cost per result.
```

Jika user klik bantuan lagi:

```text
Response card aktif di-overwrite dengan jawaban baru
Jawaban lama masuk Recent Help/history kecil
```

Jika user klik bantuan saat jawaban masih loading:

```text
Cancel generation lama
Generate jawaban baru
```

---

### 3.7 End Interview

Saat user klik End Interview:

```text
Stop Gemini Live session
Simpan transcript text
Generate post-interview summary
Auto-save summary ke database
Kembali ke application detail
```

Yang disimpan:

```text
- transcript text
- questions/topics
- generated help history
- post-interview summary
- interview stage
- timestamp
```

Yang tidak disimpan:

```text
- audio recording
```

---

## 4. PRD Ringkas

### Problem

Kandidat sering gagal bukan karena tidak punya kemampuan, tetapi karena blank, gugup, tidak bisa menyusun jawaban, dan tidak bisa membuktikan value secara cepat saat interview live.

### Target User

Kandidat kerja Indonesia yang menjalani interview online, terutama fresh graduate sampai early career.

### Core Pain

```text
Saat interviewer bertanya, kandidat butuh bantuan cepat untuk memahami maksud pertanyaan dan menyusun jawaban yang terdengar natural.
```

### Value Proposition

```text
Membantu kandidat tidak blank saat interview dengan jawaban singkat, terstruktur, dan relevan berdasarkan CV + job description.
```

### Success Metric MVP

1. User bisa start interview tanpa friction besar.
2. Jawaban AI muncul cepat setelah user klik bantuan.
3. User merasa terbantu saat blank/gugup.
4. User bersedia bayar untuk sesi interview berikutnya.

### Core Features

| Feature | Priority | Notes |
|---|---:|---|
| Upload CV | P0 | Profile-level/global |
| Create Application | P0 | Company + role + JD |
| Start Interview Round | P0 | HR/Technical/User/Final |
| Floating Overlay | P0 | Mini + expanded |
| Gemini Live listening | P0 | Interviewer audio |
| Bantu Jawab | P0 | Main action |
| Bantu Follow-up | P1 | Untuk follow-up question |
| Jelaskan Maksudnya | P1 | Untuk clarify pertanyaan |
| Keyword chips | P1 | Hanya keyword penting |
| Free text ask | P1 | Fallback manual |
| Post-interview summary | P1 | Auto-save |
| Payment Midtrans | P0 | Paywall/subscription |

---

## 5. Technical Spec

### 5.1 Tech Stack

```text
Desktop:
- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

Backend:
- Node.js
- Fastify

Database:
- PostgreSQL self-hosted di VPS

AI Models:
- gemini-3-flash-preview
  Untuk CV PDF processing, JD processing, application context, post-interview summary, dan structured JSON extraction.

- gemini-3.1-flash-live-preview
  Untuk live interview session, realtime audio input, input audio transcription, keyword context, dan response text saat user klik bantuan.

Realtime Protocol:
- Gemini Live API WebSocket
- Client-to-server dari Electron ke Gemini Live
- Backend hanya menyiapkan token/config, auth, subscription check, dan persistence

Payment:
- Midtrans Snap
- Midtrans webhook

Storage:
- VPS local storage untuk file CV
- PostgreSQL untuk metadata, summary, transcript, dan help events
```

---

### 5.2 Model Usage Definition

| Use Case | Model | API Mode | Reason |
|---|---|---|---|
| Read CV PDF | `gemini-3-flash-preview` | `generateContent` | Support PDF input dan structured outputs |
| Extract CV summary | `gemini-3-flash-preview` | `generateContent` | Butuh JSON stabil, bukan realtime |
| Extract JD summary | `gemini-3-flash-preview` | `generateContent` | Butuh role requirements, keywords, dan interview themes |
| Create application context | `gemini-3-flash-preview` | `generateContent` | Dipakai ulang untuk semua interview round di application tersebut |
| Live interview listening | `gemini-3.1-flash-live-preview` | Live API WebSocket | Butuh low-latency audio input dan transcription |
| Generate live answer | `gemini-3.1-flash-live-preview` | Live API WebSocket | Session sudah punya audio context, jadi respon bisa cepat |
| Post-interview summary | `gemini-3-flash-preview` | `generateContent` | Summary tidak realtime, lebih cocok batch/non-live |

Rule penting:

```text
Jangan pakai Gemini Live untuk membaca CV/JD PDF.
Jangan pakai generateContent biasa untuk momen live interview.
```

---

### 5.3 AI Architecture

Ada dua mode AI:

#### A. Setup / preprocessing mode

Dipakai sebelum interview:

```text
CV PDF
→ gemini-3-flash-preview generateContent
→ candidate_summary_json
→ ready_context_for_live_interview
→ simpan PostgreSQL
```

```text
Job Description
→ gemini-3-flash-preview generateContent
→ job_summary_json
→ application_context
→ domain_profile / niche_boundary
→ simpan PostgreSQL
```

Catatan revisi: `domain_keywords` lama diganti secara konsep menjadi `domain_profile / niche_boundary`. Keyword final untuk overlay tidak disimpan sebagai daftar statis dari JD.

Tujuan:

- CV dan JD diproses sekali, bukan setiap user klik bantuan.
- Live session tidak membawa dokumen mentah.
- Saat interview dimulai, Live API hanya menerima context ringkas.

#### B. Live interview mode

Dipakai saat interview berlangsung:

```text
Electron captures interviewer audio
→ stream audio chunks ke Gemini Live WebSocket
→ Gemini Live mengirim input audio transcription
→ app update latest transcript, latest question, dan keyword state
→ user klik bantuan
→ app kirim text trigger ke Live session
→ Gemini Live mengirim response text
→ overlay render response card
```

Gemini Live output hanya text.

---

### 5.4 Gemini Live Session Setup

Saat user klik Start Interview, backend melakukan:

```text
1. Cek subscription aktif
2. Ambil active CV summary
3. Ambil application context
4. Ambil interview stage context
5. Buat token/config Gemini Live
6. Kirim config ke Electron
```

Electron membuka session:

```text
Model: gemini-3.1-flash-live-preview
Response modality: TEXT
Input: interviewer audio + text trigger dari UI
Thinking level: minimal
Audio input transcription: enabled
Automatic VAD: enabled
```

Context awal yang dikirim ke Live session:

```text
Candidate summary:
[ready_context_for_live_interview]

Application context:
- Company
- Role
- Job summary
- Domain keywords

Interview stage:
HR / Technical / User / Final

Behavior instruction:
- Dengarkan interviewer.
- Jangan menjawab otomatis.
- Jawab hanya saat user klik tombol/keyword/free text.
- Output text berbentuk poin fleksibel.
- Ikuti bahasa interview.
- Hindari jawaban panjang.
```

Contoh stage context:

```text
Stage: HR
Fokus: motivasi, komunikasi, salary, culture fit, availability.
```

```text
Stage: User
Fokus: skill, pengalaman, problem solving, metrik, cara kerja.
```

---

### 5.5 Near Realtime Runtime Behavior

Tujuan engineer:

```text
Saat user klik bantuan, sistem tidak boleh baru mulai memahami interview dari nol.
Sistem harus sudah punya transcript, latest question, stage context, dan domain context sebelum user klik.
```

#### Timeline contoh

```text
T-10 menit sebelum interview:
CV dan JD sudah diproses menjadi summary.

T+0 detik:
User klik Start Interview.
Overlay mini muncul.
Gemini Live session dibuat.
Context ringkas dikirim ke session.

T+5 detik:
Interviewer mulai bicara.
Electron stream audio chunk kecil ke Gemini Live.

T+5.2 detik:
Input audio transcription mulai masuk.
App update rolling transcript.

T+8 detik:
Interviewer menyebut "conversion", "campaign", atau "funnel".
AI menilai transcript terhadap domain_profile application.
Jika istilah relevan dengan niche, overlay otomatis expanded.
Jika istilah keluar domain, overlay tetap mini.

Catatan revisi: keyword surfacing tidak lagi memakai hardcoded matching terhadap `domain_keywords`. Runtime AI harus menilai transcript terhadap `domain_profile`; jika keluar niche, overlay tetap mini.

T+12 detik:
Interviewer selesai bertanya.
App menyimpan latest_question.

T+13 detik:
Siti klik Bantu Jawab.
App tidak mengirim CV/JD mentah.
App hanya kirim trigger pendek ke Live session.

T+13.1 detik:
Gemini Live sudah punya audio/transcript/context dalam session.
Model mulai generate text answer.

T+13.5 detik:
Token pertama/jawaban awal muncul di response card.
```

#### Yang membuat near realtime

```text
1. CV/JD sudah diproses sebelum interview.
2. Context awal dikirim saat session dimulai.
3. Audio interviewer sudah streaming sejak awal.
4. Transcript sudah masuk sebelum user klik bantuan.
5. latest_question selalu diperbarui secara rolling.
6. Keyword surfacing memakai domain_profile + transcript live, bukan hardcoded keyword matching.
7. Saat user klik, request ke Gemini Live hanya trigger pendek.
8. Response dirender streaming, tidak menunggu full answer selesai.
```

Catatan revisi near realtime: poin keyword harus dibaca sebagai domain-aware keyword surfacing berbasis `domain_profile + transcript live`, bukan keyword matching statis.

#### Trigger saat user klik Bantu Jawab

Contoh text trigger yang dikirim ke Live session:

```text
Action: BANTU_JAWAB
Use the latest interviewer question from the live transcript.
Use candidate context, application context, and interview stage context already provided.
Return concise bullet points that the candidate can say naturally.
Match the interview language.
```

#### Trigger saat user klik keyword

```text
Action: EXPLAIN_KEYWORD
Keyword: Conversion Rate
Explain what the interviewer likely means and give a short answer angle.
Return concise bullet points.
```

#### Trigger saat user klik Jelaskan Maksudnya

```text
Action: EXPLAIN_QUESTION
Explain the intent behind the latest interviewer question.
Return what the interviewer is trying to evaluate and how the candidate should answer.
```

#### Anti-pattern yang tidak boleh dilakukan engineer

```text
Jangan:
- Menunggu interview selesai baru transcribe.
- Mengirim CV PDF/JD penuh setiap user klik bantuan.
- Membuka generateContent request baru untuk setiap live answer.
- Mengirim audio lewat backend jika targetnya latency rendah.
- Menampilkan jawaban otomatis tanpa user klik.
- Menumpuk banyak response card di overlay.
```

---

### 5.6 Realtime Best Practice

Saat streaming audio:

```text
- Audio chunk: 20–40 ms
- Jangan buffer audio besar
- Resample input audio ke 16 kHz
- Gunakan context window compression
- Implement session resumption
- Handle GoAway message
- Process all content parts in each server event
- UI tidak boleh terganggu saat reconnect
```

UX kandidat tetap terlihat sebagai satu interview session walaupun di belakang layar sistem melakukan reconnect/session management.

---

### 5.7 Overlay Behavior

State overlay:

```text
MINI
EXPANDED
LOADING_RESPONSE
SHOWING_RESPONSE
ERROR
```

Rules:

```text
Start Interview → MINI
Manual toggle → MINI ↔ EXPANDED
Keyword penting terdeteksi → EXPANDED
User klik bantuan → LOADING_RESPONSE → SHOWING_RESPONSE
Esc → kembali ke MINI / tutup response
End Interview → close overlay
```

---

### 5.8 Shortcut

Default shortcut:

```text
Ctrl + Space = Bantu Jawab
Ctrl + Shift + F = Bantu Follow-up
Ctrl + Shift + E = Jelaskan Maksudnya
Ctrl + Shift + K = Toggle mini/expanded
Esc = Tutup response / kembali mini
```

Mac equivalent:

```text
Cmd + Space
Cmd + Shift + F
Cmd + Shift + E
Cmd + Shift + K
Esc
```

---

## 6. Database Schema

### 6.1 users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### 6.2 candidate_profiles

```sql
CREATE TABLE candidate_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  active_cv_id UUID,
  default_answer_language TEXT DEFAULT 'auto',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### 6.3 candidate_cvs

```sql
CREATE TABLE candidate_cvs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_mime_type TEXT,
  summary_json JSONB,
  ready_context TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 6.4 applications

```sql
CREATE TABLE applications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  cv_id UUID REFERENCES candidate_cvs(id),
  company_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  job_description TEXT,
  job_summary_json JSONB,
  company_context TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### 6.5 interview_rounds

```sql
CREATE TABLE interview_rounds (
  id UUID PRIMARY KEY,
  application_id UUID REFERENCES applications(id),
  user_id UUID REFERENCES users(id),
  stage_type TEXT NOT NULL,
  language_detected TEXT,
  transcript_text TEXT,
  summary_json JSONB,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Allowed `stage_type`:

```text
HR
TECHNICAL
USER
FINAL
OTHER
```

---

### 6.6 help_events

```sql
CREATE TABLE help_events (
  id UUID PRIMARY KEY,
  interview_round_id UUID REFERENCES interview_rounds(id),
  event_type TEXT NOT NULL,
  trigger_text TEXT,
  detected_question TEXT,
  generated_answer TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Allowed `event_type`:

```text
ANSWER_HELP
FOLLOW_UP_HELP
EXPLAIN_QUESTION
KEYWORD_CLICK
FREE_TEXT
```

---

### 6.7 payments

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider TEXT DEFAULT 'midtrans',
  order_id TEXT UNIQUE NOT NULL,
  gross_amount NUMERIC,
  transaction_status TEXT,
  payment_type TEXT,
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### 6.8 subscriptions

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  status TEXT NOT NULL,
  plan_name TEXT,
  active_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 7. API Endpoints

### Auth/User

```text
POST /auth/register
POST /auth/login
GET /me
```

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
```

### Interview

```text
POST /interviews/start
POST /interviews/:id/end
GET /interviews/:id
GET /applications/:id/interviews
```

### Gemini Live

```text
POST /live/token
```

Returns short-lived token/config for Electron client.

### Payment

```text
POST /payments/create-snap
POST /payments/midtrans-webhook
GET /subscription/status
```

---

## 8. Prompting Draft

### 8.1 CV Extraction Prompt

```text
Extract this CV into structured JSON for an interview assistant.
Focus on facts that help the candidate answer interview questions.
Do not hallucinate. If unknown, return null.

Return:
- name
- education
- experience_level
- key_experiences
- skills
- strengths_for_interview
- weakness_or_risk
- ready_context_for_live_interview
```

---

### 8.2 JD Extraction Prompt

```text
Summarize this job description for real-time interview assistance.
Focus on role requirements, responsibilities, keywords, and likely interview themes.
Return concise JSON.
```

---

## 8. MVP Acceptance Criteria

### Setup

- User can upload CV PDF.
- CV is processed into candidate summary.
- User can create application with company, role, and JD.
- JD is processed into job summary.

### Interview

- User can start interview round.
- Mini overlay appears by default.
- App listens to interviewer audio.
- Important keyword can trigger expanded overlay.
- User can manually toggle overlay.
- User can click Bantu Jawab.
- Text answer appears quickly in response card.
- New response overwrites active card, old response saved in history.
- User can end interview.
- Transcript text and summary are saved.

### Payment

- User can create payment via Midtrans Snap.
- Webhook updates payment/subscription status.
- Only active users can start interview session.

---

## 10. Bottom Line

Yang harus dibuat untuk MVP bukan semua fitur besar, tapi satu flow yang tajam:

```text
CV global
→ Application dengan company + JD
→ Start interview round
→ Overlay dengar interviewer
→ User klik bantuan
→ Jawaban text cepat, ringkas, dan natural
→ Transcript + summary tersimpan
```

Fokus utama produk: membantu kandidat tidak blank dan menjawab lebih meyakinkan saat interview live.
