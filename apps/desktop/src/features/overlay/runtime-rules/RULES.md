# Overlay Runtime Rules

Folder ini menyimpan rule runtime overlay yang berhubungan dengan AI trigger, transcript, dan response copy.

Untuk aturan context integrity overlay secara keseluruhan, baca `../CONTEXT_INTEGRITY.md` sebelum mengubah transcript, latest focus, stable context, atau keyword chips.

## Prinsip

- `InterviewOverlay.tsx` harus tetap fokus pada UI state, event wiring, dan rendering.
- Prompt, response copy, transcript heuristics, dan rule AI lain tidak boleh ditaruh langsung di `InterviewOverlay.tsx`.
- Jika ada kebutuhan baru yang cukup berbeda, buat file rule baru di folder ini.
- Jangan menumpuk semua use case ke satu file besar hanya karena lebih cepat.
- Boleh extend file yang sudah ada hanya jika use case-nya benar-benar masih satu domain tanggung jawab.

## Pembagian Saat Ini

- `packages/shared/src/realtime-overlay.ts`: prompt/action instruction dan parser response untuk desktop serta web; file lokal hanya re-export kompatibilitas.
- `overlay-response-copy.ts`: copy notice, formatting response, dan parser response text.
- `packages/shared/src/transcript-focus-rules.ts`: rule transcript quality gate, conversation focus, relevance, dan noise filtering; file lokal hanya re-export kompatibilitas.

## Saat Menambah Use Case

- Buat nama file yang spesifik terhadap tanggung jawabnya.
- Hindari hardcode contoh domain, company, device, atau skenario testing lokal.
- Pastikan rule tetap generic untuk semua profil user + konteks meeting.
- Keyword chips dipilih oleh backend AI action, bukan heuristic lokal di desktop.
- Signal transcript harus role-neutral. Jangan membuat daftar yang terlalu condong ke satu use case seperti data/ML, sales, design, legal, atau domain tertentu.
- Semua transcript harus lolos quality gate sebelum menjadi `latestFocus`, stable context, atau keyword source.
- Jangan bypass `classifyTranscriptQuality()` dari component atau helper lain.
- Jika konteks fresh ada tetapi tidak ada keyword konkret, tampilkan empty state dan biarkan tombol bantuan tetap dipakai.
- Noise filter boleh mengenali pola umum iklan, tetapi jangan hardcode nama produk/company dari video atau test manual.
- Contoh kontaminasi seperti assistant-addressing, prompt instruction, atau UI/debug text harus masuk test/documentation, bukan menjadi prompt desktop.
- Setelah edit, minimal jalankan `npm.cmd run typecheck`.
