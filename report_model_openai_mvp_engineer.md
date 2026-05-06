# Report Singkat: Perubahan Model AI untuk MVP Interview Assistant

## Tujuan

Dokumen ini menginformasikan perubahan model AI dari rencana awal berbasis Gemini menjadi OpenAI untuk kebutuhan MVP interview assistant.

Keputusan model saat ini:

- `gpt-5-mini` untuk preprocessing CV, Job Description, application context, dan post-interview summary.
- `gpt-realtime-mini` untuk sesi interview real-time.

---

## 1. Model untuk CV dan Job Description

### Model

`gpt-5-mini`

### Dipakai untuk

- Ekstraksi isi CV dari file PDF atau text hasil parsing.
- Merapikan dan meringkas CV kandidat.
- Menganalisis Job Description.
- Membuat application context: hubungan antara CV, role, perusahaan, dan JD.
- Menyusun interview prep singkat.
- Membuat post-interview summary setelah sesi selesai.

### Kenapa cocok untuk MVP

- Lebih murah dibanding model flagship.
- Cocok untuk task berbasis teks.
- Bisa menerima input text dan image; output utamanya text.
- Mendukung reasoning token, sehingga lebih cocok untuk analisis CV/JD dibanding model realtime.

### Output yang diharapkan

- Ringkasan kandidat.
- Skill dan pengalaman relevan.
- Gap kandidat terhadap JD.
- Selling points kandidat.
- Prediksi topik/pertanyaan interview.
- Context pack untuk dipakai saat interview.

### Contoh hasil preprocessing

```text
Candidate Context:
- Nama kandidat: Siti
- Role: Marketing Associate
- Relevansi utama: pengalaman campaign, social media, market research
- Selling points: pernah mengelola campaign kampus, memahami funnel awareness-to-conversion
- Risiko/gap: pengalaman full-time masih terbatas
- Gaya jawaban: ringkas, natural, percaya diri, bahasa Indonesia
```

---

## 2. Model untuk Interview Real-Time

### Model

`gpt-realtime-mini`

### Dipakai untuk

- Mendengarkan audio interviewer secara real-time.
- Mendeteksi kapan interviewer selesai bicara.
- Membantu memahami pertanyaan interviewer.
- Menghasilkan jawaban singkat berbasis context kandidat.
- Menghasilkan keyword chips dari ucapan interviewer.
- Menghasilkan bantuan follow-up atau penjelasan maksud pertanyaan.

### Kenapa cocok untuk MVP

- Native realtime model.
- Mendukung input audio, text, dan image.
- Mendukung output text dan audio, tetapi MVP hanya memakai output text.
- Bisa digunakan via WebRTC untuk browser/client app.
- Mendukung WebSocket untuk server-to-server.
- Mendukung Voice Activity Detection untuk mendeteksi mulai/berhentinya ucapan.
- Lebih murah daripada model realtime flagship.

### Output yang dipakai di MVP

MVP hanya memakai output text, bukan audio.

Output utama:

- Jawaban singkat untuk kandidat.
- Keyword chips.
- Saran follow-up.
- Penjelasan maksud pertanyaan.

Contoh output:

```json
{
  "detected_question": "Ceritakan pengalaman kamu menjalankan campaign marketing.",
  "keywords": ["campaign marketing", "target audience", "conversion"],
  "suggested_answer": "Saya pernah mengelola campaign untuk meningkatkan awareness sebuah program kampus. Saya mulai dari menentukan target audience, membuat pesan utama, lalu mengukur hasil dari engagement dan conversion sederhana. Dari situ saya belajar pentingnya testing angle dan CTA agar campaign lebih efektif.",
  "follow_up_suggestion": "Boleh saya jelaskan juga metrik yang saya pakai untuk mengevaluasi campaign tersebut?"
}
```

---

## 3. Arsitektur Alur MVP

### Sebelum interview

```text
Upload CV + input posisi + input JD
→ gpt-5-mini
→ hasilkan candidate context
→ simpan ke database
```

### Saat interview

```text
Audio interviewer
→ gpt-realtime-mini
→ VAD mendeteksi ucapan selesai
→ model memahami pertanyaan
→ model membuat jawaban text singkat
→ tampil di floating overlay
```

### Setelah interview

```text
Transcript + catatan sesi
→ gpt-5-mini
→ post-interview summary
→ simpan ke database
```

---

## 4. Behavior Produk yang Harus Dijaga

### Floating overlay

- Default mulai dari mode mini.
- Expanded saat user toggle atau saat keyword chips muncul.
- Tidak mengganggu layar interview.
- Semi-transparan.
- Output selalu text, bukan suara.

### Bahasa

- Jika interview Bahasa Indonesia, jawab Bahasa Indonesia.
- Jika interview English, jawab English.
- Jangan translate paksa jika interviewer campur bahasa.

### Jawaban AI

- Singkat.
- Natural.
- Bisa langsung dipakai kandidat.
- Tidak terlalu formal.
- Tidak terlalu panjang.
- Tidak terdengar seperti robot.

### Trigger jawaban

MVP tetap mengutamakan manual trigger:

- `Bantu Jawab`
- `Bantu Follow-up`
- `Jelaskan Maksudnya`
- Free text input
- Keyword chips

Realtime audio dipakai untuk context dan transcript, bukan berarti semua pertanyaan harus otomatis dijawab tanpa kontrol user.

---

## 5. Catatan Implementasi untuk Engineer

### Environment variable yang disarankan

```env
# OpenAI
OPENAI_API_KEY=

# Preprocessing phase
OPENAI_TEXT_MODEL=gpt-5-mini

# Live interview phase
OPENAI_REALTIME_MODEL=gpt-realtime-mini

# Optional fallback
OPENAI_REALTIME_FALLBACK_MODEL=gpt-realtime-1.5
```

### Hal yang perlu diperhatikan

- Jangan lagi hardcode Gemini model di flow utama MVP.
- Pisahkan service untuk preprocessing dan realtime.
- Jangan mengirim ulang full CV/JD ke realtime model setiap turn jika tidak perlu.
- Kirim compact candidate context ke realtime session.
- Simpan transcript dan AI responses untuk post-interview summary.
- Untuk browser app, prioritaskan WebRTC.
- Untuk server-to-server, gunakan WebSocket.
- Matikan audio output karena MVP hanya butuh text output.

---

## 6. Ringkasan Keputusan

| Kebutuhan | Model | Alasan |
|---|---|---|
| CV parsing & summary | `gpt-5-mini` | Murah, kuat untuk task teks, cocok untuk preprocessing |
| JD analysis | `gpt-5-mini` | Cocok untuk memahami role dan membuat context |
| Candidate context | `gpt-5-mini` | Bisa menyusun selling points dan gap kandidat |
| Real-time interview | `gpt-realtime-mini` | Native realtime, support audio input, VAD, text output |
| Post-interview summary | `gpt-5-mini` | Lebih cocok untuk summary dan evaluasi berbasis transcript |

Bottom line:

MVP sekarang menggunakan OpenAI sepenuhnya:

```text
gpt-5-mini = sebelum dan sesudah interview
gpt-realtime-mini = saat interview berlangsung
```

Fokus produk tetap sama:

```text
Membantu kandidat tidak blank dan menjawab lebih meyakinkan saat interview.
```

